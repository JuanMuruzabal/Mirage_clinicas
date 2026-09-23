package http

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// disponibilidadPasoMinutos: granularidad de los horarios candidatos que
// se ofrecen — cada 15 minutos, mismo paso que ya usaban los turnos
// manuales (DURACIONES en el frontend: 15/30/45/60). Los bloqueos/turnos
// ya existentes se siguen comparando con su horario EXACTO, no
// redondeado a este paso — solo los horarios NUEVOS que se ofrecen caen
// en el grid de 15 minutos.
const disponibilidadPasoMinutos = 15

// registerDisponibilidadRoutes monta GET /disponibilidad — corrección de
// QA sobre F2.3 (docs/Arquitectura y base/implementation-plan.md §11.3, adelanta parte de
// F2.4.1/TR-079): "solo me tiene que salir seleccionables los horarios
// que entran en mi agenda, teniendo en cuenta horarios de otros
// usuarios, los bloqueos de horarios, y el tiempo total del turno". A
// diferencia de F2.4 (todavía no construido, para el formulario público
// del paciente), este endpoint es AUTENTICADO — lo usa el propio
// profesional desde "+ Agregar turno"/"Editar turno" en el panel.
func registerDisponibilidadRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/disponibilidad", listDisponibilidadHandler(gdb))
}

type disponibilidadResponse struct {
	Slots []string `json:"slots"`
}

func listDisponibilidadHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		tipoConsultaIDStr := strings.TrimSpace(r.URL.Query().Get("tipoConsultaId"))
		fechaStr := strings.TrimSpace(r.URL.Query().Get("fecha"))
		if tipoConsultaIDStr == "" || fechaStr == "" {
			writeError(w, http.StatusBadRequest, "tipoConsultaId y fecha son obligatorios")
			return
		}
		tipoConsultaID, err := uuid.Parse(tipoConsultaIDStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "tipoConsultaId inválido")
			return
		}
		fecha, err := clock.ParseDate(fechaStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "la fecha debe tener el formato YYYY-MM-DD")
			return
		}

		// excluirTurnoId (edición): el turno que se está reprogramando no
		// debe contar como "ocupado" contra sí mismo — si no, el horario
		// que ya tiene hoy dejaría de aparecer como disponible.
		var excluirTurnoID *uuid.UUID
		if v := strings.TrimSpace(r.URL.Query().Get("excluirTurnoId")); v != "" {
			id, err := uuid.Parse(v)
			if err != nil {
				writeError(w, http.StatusBadRequest, "excluirTurnoId inválido")
				return
			}
			excluirTurnoID = &id
		}

		// UNA SOLA AGENDA PARA LAS DOS COSAS (QA de la 3.2.6, 2026-09-20).
		//
		// Antes el tipo se buscaba con el scope de la sesión y los huecos
		// se calculaban con `profesionalQueAtiende`: dos respuestas que
		// podían ser de personas distintas. Con "+ Agregar turno"
		// eligiendo agenda en el propio modal eso deja de ser teórico —
		// el tipo elegido es del profesional del modal y los huecos serían
		// los del que está en foco. El resultado no es la agenda de
		// ninguno de los dos.
		//
		// `?profesionalUserId=` es lo que manda el modal; sin él vale el
		// foco, y para un profesional su propia agenda.
		profesionalID, ok := agendaAConfigurar(w, r, gdb, clinicID, r.URL.Query().Get("profesionalUserId"))
		if !ok {
			return
		}
		if profesionalID == uuid.Nil {
			// Recepción en la vista general: hay que decirle de qué agenda
			// se trata antes de poder ofrecer un horario.
			writeError(w, http.StatusConflict, errFaltaElegirProfesional.Error())
			return
		}

		var tipo db.TipoConsulta
		// El tipo tiene que ser DE ESA AGENDA: calcular la disponibilidad
		// con el tipo de un colega mezclaría su duración y su preferencia
		// horaria con otra agenda, y el resultado no sería la de ninguno.
		if err := gdb.Scopes(soloDeLaAgendaDe(profesionalID)).
			Where("id = ? AND clinic_id = ?", tipoConsultaID, clinicID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		slots, err := calcularDisponibilidad(gdb, clinicID, profesionalID, tipo, fecha, excluirTurnoID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo calcular la disponibilidad")
			return
		}

		writeJSON(w, http.StatusOK, disponibilidadResponse{Slots: slots})
	}
}

// intervaloMinutos es un rango [Desde, Hasta) en minutos desde
// medianoche — unidad común para comparar bloqueos ("HH:MM" de pared) y
// turnos (timestamptz convertidos a hora local, clock.In) sin mezclar
// tipos de dato.
type intervaloMinutos struct {
	Desde int
	Hasta int
}

func (a intervaloMinutos) solapaCon(b intervaloMinutos) bool {
	return a.Desde < b.Hasta && b.Desde < a.Hasta
}

func horaAMinutos(hhmm string) int {
	partes := strings.SplitN(hhmm, ":", 2)
	if len(partes) != 2 {
		return 0
	}
	h, _ := strconv.Atoi(partes[0])
	m, _ := strconv.Atoi(partes[1])
	return h*60 + m
}

func minutosDesdeMedianoche(t time.Time) int {
	local := clock.In(t)
	return local.Hour()*60 + local.Minute()
}

func formatMinutosComoHora(mins int) string {
	return fmt.Sprintf("%02d:%02d", mins/60, mins%60)
}

// horarioAtencionEfectivo — resuelve qué fila de horario de atención
// aplica un día concreto (corrección de QA, 2026-09-01: "puede que un
// profesional tenga horarios de atención variable"). Mismo criterio de
// prioridad que bloqueos_horario (la más específica gana): "rango"
// (fechas elegidas a mano) > "semana" > "mes" > "general" (la única sin
// fecha de inicio/fin, el fallback de siempre). Devuelve nil si ninguna
// fila aplica (la clínica todavía no guardó nada, ni siquiera la
// general) — el caller cae al default hardcodeado en ese caso; si la
// fila resuelta tiene HoraDesde/HoraHasta en nil, ES a propósito: el
// profesional configuró "no trabajo" ese período.
func horarioAtencionEfectivo(horarios []db.HorarioAtencion, fecha time.Time) *db.HorarioAtencion {
	fechaStr := fecha.Format("2006-01-02")
	prioridad := map[string]int{
		db.HorarioAtencionAlcanceRango:   3,
		db.HorarioAtencionAlcanceSemana:  2,
		db.HorarioAtencionAlcanceMes:     1,
		db.HorarioAtencionAlcanceGeneral: 0,
	}

	var mejor *db.HorarioAtencion
	mejorPrioridad := -1
	for i := range horarios {
		h := &horarios[i]
		aplica := h.Alcance == db.HorarioAtencionAlcanceGeneral
		if !aplica && h.FechaDesde != nil && h.FechaHasta != nil {
			desdeStr := h.FechaDesde.Format("2006-01-02")
			hastaStr := h.FechaHasta.Format("2006-01-02")
			aplica = fechaStr >= desdeStr && fechaStr <= hastaStr
		}
		if !aplica {
			continue
		}
		if p := prioridad[h.Alcance]; p > mejorPrioridad {
			mejorPrioridad = p
			mejor = h
		}
	}
	return mejor
}

// bloqueosDelDia — bloqueos generales Y específicos vigentes ese día,
// sin ninguna lógica de "cuál gana" (corrección de QA, 2026-08-30, sobre
// un bug real de disponibilidad): para calcular qué minutos quedan
// bloqueados no hace falta decidir prioridad entre una regla específica
// y una general que se solapan — ambas significan "bloquear horario"
// (hoy el único TipoRegla que existe), así que el resultado correcto es
// simplemente la UNIÓN de los dos rangos, nunca uno "tapando" al otro
// entero. La versión anterior de esta función suprimía la regla general
// COMPLETA en cuanto una específica la solapaba aunque sea parcialmente
// — el cliente encontró el caso real: general 11:00-13:00 + específica
// 12:00-13:00 (la específica NO cubre la totalidad de la general)
// dejaba 11:00-12:00 disponible para reservar, cuando el profesional
// seguía queriendo esa franja bloqueada por la regla general. La
// prioridad "específica gana sobre general" (TR-084) sigue existiendo,
// pero es un criterio de VISUALIZACIÓN en el calendario (qué bloque se
// dibuja encima/oculta a nivel de grilla — ver bloqueosEfectivosDelDia en
// apps/web/.../calendar-grid.tsx), no de cálculo de disponibilidad.
func bloqueosDelDia(fecha time.Time, generales, especificas []db.BloqueoHorario) []db.BloqueoHorario {
	fechaStr := fecha.Format("2006-01-02")
	diaSemana := int(fecha.Weekday()) // 0=domingo, igual que EXTRACT(DOW) y JS Date.getDay()

	var delDia []db.BloqueoHorario
	for _, b := range especificas {
		if b.Fecha != nil && b.Fecha.Format("2006-01-02") == fechaStr {
			delDia = append(delDia, b)
		}
	}

	for _, b := range generales {
		if b.DiaSemana == nil || *b.DiaSemana != diaSemana {
			continue
		}
		if b.Alcance != nil && *b.Alcance == db.BloqueoAlcanceTodos {
			delDia = append(delDia, b)
			continue
		}
		if b.FechaDesde == nil || b.FechaHasta == nil {
			continue
		}
		desdeStr := b.FechaDesde.Format("2006-01-02")
		hastaStr := b.FechaHasta.Format("2006-01-02")
		if fechaStr >= desdeStr && fechaStr <= hastaStr {
			delDia = append(delDia, b)
		}
	}

	return delDia
}

// calcularDisponibilidad — el corazón del cálculo (corrección de QA):
// horario de atención MENOS bloqueos vigentes ese día MENOS los turnos ya
// agendados (con su propio tiempo post-consulta contando como ocupado
// también, no solo su duración) — solo quedan disponibles los inicios
// donde entra la consulta completa (duración + tiempo post-consulta) sin
// pisar nada de eso, en pasos de 15 minutos.
//
// Sin goroutines a propósito (el cliente las sugirió): el volumen real
// acá es trivial — unas pocas decenas de horarios candidatos (un día
// completo en pasos de 15 minutos) contra, como mucho, un puñado de
// turnos/bloqueos de ESE día para UNA clínica — repartir esto en
// goroutines sumaría sincronización (mutex o channels para juntar
// resultados) sin ninguna ganancia medible, el mismo criterio que
// TR-079 en docs/Arquitectura y base/tradeoffs.md ya dejó asentado para esta cuenta.
// calcularDisponibilidad — los huecos de UN profesional, no de la clínica
// (corregido el 2026-09-14).
//
// Hasta acá leía el horario de atención, los horarios reservados Y los
// turnos ocupados filtrando solo por `clinic_id`. Con un profesional por
// clínica daba igual; con dos, cada una de las tres cosas estaba mal:
//
//   - El horario y los bloqueos de un colega recortaban la agenda del
//     otro.
//   - Y los turnos ajenos ocupaban sus horarios: el turno del colega a las
//     10 bloqueaba las 10 propias. Eso es EXACTAMENTE el bug que la 3.2.1
//     sacó del exclusion constraint al mudarlo de la clínica a
//     `atendido_por_user_id` —"sobre la clínica rechazaría dos turnos
//     simultáneos en sillones distintos"— reaparecido un nivel más arriba:
//     el motor ya los dejaba convivir, pero la pantalla no los ofrecía.
//
// `user_id IS NULL` entra igual que en soloMiAgenda: son las filas
// anteriores a la 3.2.1, que la migración le asigna al owner.
// reglasDeDisponibilidad — TODO lo que no cambia de un día a otro.
//
// Ronda de optimización post-Fase 3, tercera parte (2026-09-23). De las
// cinco consultas que hacía `calcularDisponibilidad`, CUATRO no dependían
// de la fecha: el horario de atención del profesional, sus horarios
// reservados generales, los específicos y el catálogo de tipos de
// consulta de la clínica (que solo se usa para saber cuánto tiempo
// post-consulta ocupa cada turno ya agendado).
//
// Eso da igual cuando se pregunta por un día. Pero hay tres bucles que
// preguntan por TREINTA:
//
//   - `primerDiaConHueco` (el indicador "próximo disponible" del wizard
//     público), que además corre UNA VEZ POR PROFESIONAL;
//   - el calendario mensual del wizard;
//   - el del panel.
//
// Con cinco profesionales y una ventana de 30 días eran unos 750 viajes a
// Postgres en un solo request público, y 600 de ellos devolvían
// exactamente las mismas filas.
//
// `turnosPorDia`, cuando no es nil, es la otra mitad: los turnos del
// rango completo traídos de una y agrupados por día, en vez de una
// consulta por día. Los bucles lo precargan con `cargarReglasDeRango`;
// quien pregunta por un solo día lo deja en nil y se consulta al vuelo.
type reglasDeDisponibilidad struct {
	horariosAtencion []db.HorarioAtencion
	generales        []db.BloqueoHorario
	especificas      []db.BloqueoHorario
	tiposPorID       map[uuid.UUID]db.TipoConsulta
	turnosPorDia     map[string][]db.Turno
}

// cargarReglasDeDisponibilidad — las cuatro consultas que no dependen del
// día, una sola vez.
func cargarReglasDeDisponibilidad(
	gdb *gorm.DB, clinicID, profesionalID uuid.UUID,
) (*reglasDeDisponibilidad, error) {
	reglas := &reglasDeDisponibilidad{}

	if err := gdb.Where("clinic_id = ? AND (user_id = ? OR user_id IS NULL)", clinicID, profesionalID).
		Find(&reglas.horariosAtencion).Error; err != nil {
		return nil, err
	}
	if err := gdb.Where("clinic_id = ? AND especifico = ? AND (user_id = ? OR user_id IS NULL)",
		clinicID, false, profesionalID).Find(&reglas.generales).Error; err != nil {
		return nil, err
	}
	if err := gdb.Where("clinic_id = ? AND especifico = ? AND (user_id = ? OR user_id IS NULL)",
		clinicID, true, profesionalID).Find(&reglas.especificas).Error; err != nil {
		return nil, err
	}

	var todosTipos []db.TipoConsulta
	if err := gdb.Where("clinic_id = ?", clinicID).Find(&todosTipos).Error; err != nil {
		return nil, err
	}
	reglas.tiposPorID = make(map[uuid.UUID]db.TipoConsulta, len(todosTipos))
	for _, t := range todosTipos {
		reglas.tiposPorID[t.ID] = t
	}
	return reglas, nil
}

// cargarReglasDeRango — igual, más los turnos de TODO el rango agrupados
// por día. Para los bucles que recorren una ventana de fechas.
//
// `hasta` es exclusivo, igual que el filtro por día de siempre. La clave
// del mapa es el día en Córdoba (`clock.In`), que es lo correcto acá
// porque `hora_inicio` es un instante (timestamptz) y no una columna
// DATE — la advertencia sobre `clock.In` aplica a las segundas, no a
// estas.
func cargarReglasDeRango(
	gdb *gorm.DB, clinicID, profesionalID uuid.UUID, desde, hasta time.Time,
) (*reglasDeDisponibilidad, error) {
	reglas, err := cargarReglasDeDisponibilidad(gdb, clinicID, profesionalID)
	if err != nil {
		return nil, err
	}

	var turnos []db.Turno
	if err := gdb.Where(
		"clinic_id = ? AND atendido_por_user_id = ? AND estado = ? AND hora_inicio >= ? AND hora_inicio < ?",
		clinicID, profesionalID, "agendado", desde, hasta,
	).Find(&turnos).Error; err != nil {
		return nil, err
	}

	reglas.turnosPorDia = map[string][]db.Turno{}
	for _, t := range turnos {
		if t.HoraInicio == nil {
			continue
		}
		dia := clock.In(*t.HoraInicio).Format("2006-01-02")
		reglas.turnosPorDia[dia] = append(reglas.turnosPorDia[dia], t)
	}
	return reglas, nil
}

// calcularDisponibilidad — un día suelto: carga las reglas y delega. Es
// la firma que usan los llamadores que preguntan por una sola fecha.
func calcularDisponibilidad(
	gdb *gorm.DB,
	clinicID uuid.UUID,
	profesionalID uuid.UUID,
	tipo db.TipoConsulta,
	fecha time.Time,
	excluirTurnoID *uuid.UUID,
) ([]string, error) {
	reglas, err := cargarReglasDeDisponibilidad(gdb, clinicID, profesionalID)
	if err != nil {
		return nil, err
	}
	return calcularDisponibilidadConReglas(gdb, reglas, clinicID, profesionalID, tipo, fecha, excluirTurnoID)
}

// calcularDisponibilidadConReglas — el cálculo de un día con las reglas
// ya en la mano.
func calcularDisponibilidadConReglas(
	gdb *gorm.DB,
	reglas *reglasDeDisponibilidad,
	clinicID uuid.UUID,
	profesionalID uuid.UUID,
	tipo db.TipoConsulta,
	fecha time.Time,
	excluirTurnoID *uuid.UUID,
) ([]string, error) {
	// Horario de atención EFECTIVO ese día (corrección de QA, 2026-09-01:
	// "puede que un profesional tenga horarios de atención variable") —
	// ver horarioAtencionEfectivo más arriba para la prioridad exacta.
	efectivo := horarioAtencionEfectivo(reglas.horariosAtencion, fecha)

	var horaDesde, horaHasta string
	switch {
	case efectivo == nil:
		// Todavía no guardó ningún horario propio — cae al default.
		horaDesde, horaHasta = horarioAtencionDefaultDesde, horarioAtencionDefaultHasta
	case efectivo.HoraDesde == nil || efectivo.HoraHasta == nil:
		// El profesional configuró "no trabajo" para este período — sin
		// franja de atención, no hay nada que ofrecer ese día.
		return []string{}, nil
	default:
		horaDesde, horaHasta = *efectivo.HoraDesde, *efectivo.HoraHasta
	}

	bloqueosAplicables := bloqueosDelDia(fecha, reglas.generales, reglas.especificas)

	var ocupados []intervaloMinutos
	for _, b := range bloqueosAplicables {
		ocupados = append(ocupados, intervaloMinutos{horaAMinutos(b.HoraDesde), horaAMinutos(b.HoraHasta)})
	}

	// Turnos ya agendados ESE día (excepto el que se está reprogramando,
	// si corresponde) — cada uno ocupa su propia duración + SU tiempo
	// post-consulta (no el del tipo que se está por reservar).
	var turnos []db.Turno
	if reglas.turnosPorDia != nil {
		// Precargados por `cargarReglasDeRango`. El turno que se está
		// reprogramando se saca acá en vez de en el WHERE: es el mismo
		// filtro, sobre un puñado de filas que ya están en memoria.
		for _, t := range reglas.turnosPorDia[fecha.Format("2006-01-02")] {
			if excluirTurnoID != nil && t.ID == *excluirTurnoID {
				continue
			}
			turnos = append(turnos, t)
		}
	} else {
		inicioDia := fecha
		finDia := fecha.AddDate(0, 0, 1)
		turnosQuery := gdb.Where(
			"clinic_id = ? AND atendido_por_user_id = ? AND estado = ? AND hora_inicio >= ? AND hora_inicio < ?",
			clinicID, profesionalID, "agendado", inicioDia, finDia,
		)
		if excluirTurnoID != nil {
			turnosQuery = turnosQuery.Where("id <> ?", *excluirTurnoID)
		}
		if err := turnosQuery.Find(&turnos).Error; err != nil {
			return nil, err
		}
	}

	for _, t := range turnos {
		if t.HoraInicio == nil || t.HoraFin == nil {
			continue
		}
		postBuffer := 0
		if t.TipoConsultaID != nil {
			if tc, ok := reglas.tiposPorID[*t.TipoConsultaID]; ok {
				postBuffer = tc.TiempoPostConsultaMinutos
			}
		}
		ocupados = append(ocupados, intervaloMinutos{
			Desde: minutosDesdeMedianoche(*t.HoraInicio),
			Hasta: minutosDesdeMedianoche(*t.HoraFin) + postBuffer,
		})
	}

	necesitaMinutos := tipo.DuracionMinutos + tipo.TiempoPostConsultaMinutos
	desdeMin := horaAMinutos(horaDesde)
	hastaMin := horaAMinutos(horaHasta)

	// Preferencia de atención (nueva función, pedido textual del cliente,
	// 2026-09-08): "el profesional solo quiere atender consultas
	// generales de 8:00 a 12:00... que la disponibilidad de este tipo de
	// turno sea afectada por esto" — recorta la ventana SOLO para este
	// tipo (max/min, nunca reemplazo): si el horario de atención general
	// ya es más angosto que la preferencia, sigue ganando el más angosto
	// de los dos — la preferencia nunca puede AMPLIAR el horario de
	// atención real.
	if tipo.PreferenciaHoraDesde != nil && tipo.PreferenciaHoraHasta != nil {
		desdeMin = max(desdeMin, horaAMinutos(*tipo.PreferenciaHoraDesde))
		hastaMin = min(hastaMin, horaAMinutos(*tipo.PreferenciaHoraHasta))
	}

	// No ofrecer horarios ya pasados si `fecha` es HOY — mismo criterio
	// que el resto del proyecto ("no se puede agendar un turno en una
	// fecha pasada"), ahora aplicado también a los candidatos que se
	// ofrecen, no solo a la validación final.
	ahora := clock.Now()
	if fecha.Year() == ahora.Year() && fecha.YearDay() == ahora.YearDay() {
		ahoraMin := ahora.Hour()*60 + ahora.Minute()
		// Redondea "ahora" hacia arriba al próximo paso de 15 minutos —
		// sin esto, el primer horario ofrecido quedaría en un minuto
		// suelto (ej. 14:07) en vez de una marca prolija (14:15).
		ahoraMin = ((ahoraMin + disponibilidadPasoMinutos - 1) / disponibilidadPasoMinutos) * disponibilidadPasoMinutos
		if ahoraMin > desdeMin {
			desdeMin = ahoraMin
		}
	}

	slots := make([]string, 0)
	for inicio := desdeMin; inicio+necesitaMinutos <= hastaMin; inicio += disponibilidadPasoMinutos {
		candidato := intervaloMinutos{inicio, inicio + necesitaMinutos}
		libre := true
		for _, o := range ocupados {
			if candidato.solapaCon(o) {
				libre = false
				break
			}
		}
		if libre {
			slots = append(slots, formatMinutosComoHora(inicio))
		}
	}

	return slots, nil
}
