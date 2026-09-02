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
// QA sobre F2.3 (docs/implementation-plan.md §11.3, adelanta parte de
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

		var tipo db.TipoConsulta
		if err := gdb.Where("id = ? AND profesional_id = ?", tipoConsultaID, clinicID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		slots, err := calcularDisponibilidad(gdb, clinicID, tipo, fecha, excluirTurnoID)
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
// TR-079 en docs/tradeoffs.md ya dejó asentado para esta cuenta.
func calcularDisponibilidad(
	gdb *gorm.DB,
	clinicID uuid.UUID,
	tipo db.TipoConsulta,
	fecha time.Time,
	excluirTurnoID *uuid.UUID,
) ([]string, error) {
	// Horario de atención EFECTIVO ese día (corrección de QA, 2026-09-01:
	// "puede que un profesional tenga horarios de atención variable") —
	// ver horarioAtencionEfectivo más arriba para la prioridad exacta.
	var horariosAtencion []db.HorarioAtencion
	if err := gdb.Where("clinic_id = ?", clinicID).Find(&horariosAtencion).Error; err != nil {
		return nil, err
	}
	efectivo := horarioAtencionEfectivo(horariosAtencion, fecha)

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

	var generales, especificas []db.BloqueoHorario
	if err := gdb.Where("clinic_id = ? AND especifico = ?", clinicID, false).Find(&generales).Error; err != nil {
		return nil, err
	}
	if err := gdb.Where("clinic_id = ? AND especifico = ?", clinicID, true).Find(&especificas).Error; err != nil {
		return nil, err
	}
	bloqueosAplicables := bloqueosDelDia(fecha, generales, especificas)

	var ocupados []intervaloMinutos
	for _, b := range bloqueosAplicables {
		ocupados = append(ocupados, intervaloMinutos{horaAMinutos(b.HoraDesde), horaAMinutos(b.HoraHasta)})
	}

	// Turnos ya agendados ESE día (excepto el que se está reprogramando,
	// si corresponde) — cada uno ocupa su propia duración + SU tiempo
	// post-consulta (no el del tipo que se está por reservar).
	inicioDia := fecha
	finDia := fecha.AddDate(0, 0, 1)
	turnosQuery := gdb.Where(
		"profesional_id = ? AND estado = ? AND hora_inicio >= ? AND hora_inicio < ?",
		clinicID, "agendado", inicioDia, finDia,
	)
	if excluirTurnoID != nil {
		turnosQuery = turnosQuery.Where("id <> ?", *excluirTurnoID)
	}
	var turnos []db.Turno
	if err := turnosQuery.Find(&turnos).Error; err != nil {
		return nil, err
	}

	var todosTipos []db.TipoConsulta
	if err := gdb.Where("profesional_id = ?", clinicID).Find(&todosTipos).Error; err != nil {
		return nil, err
	}
	tiposPorID := make(map[uuid.UUID]db.TipoConsulta, len(todosTipos))
	for _, t := range todosTipos {
		tiposPorID[t.ID] = t
	}

	for _, t := range turnos {
		if t.HoraInicio == nil || t.HoraFin == nil {
			continue
		}
		postBuffer := 0
		if t.TipoConsultaID != nil {
			if tc, ok := tiposPorID[*t.TipoConsultaID]; ok {
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
