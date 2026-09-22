package http

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// panelNotificacionesResponse — pedido textual del cliente: "si estoy
// afuera de la sección pacientes mostrar las notificaciones de conflicto
// en la zona [de arriba del todo, marcada en docs/foto1.png, que ya no está en el repo]... si es
// conflicto de pacientes que diga tenés un conflicto con los pacientes y
// me envíe al apartado paciente, si es conflicto con turno de calendario
// al calendario". Endpoint chico y barato a propósito — se sondea desde
// cualquier pantalla del panel (NotificacionesConflictoGlobal, montado en
// app/panel/layout.tsx), no solo desde Pacientes/Calendario.
type panelNotificacionesResponse struct {
	ConflictosPacientes  int64 `json:"conflictosPacientes"`
	ConflictosCalendario int64 `json:"conflictosCalendario"`
	// ConflictoCalendarioProfesionalID — de quién es la agenda del
	// conflicto más próximo (QA de la 3.2.6, 2026-09-21).
	//
	// Recepción ve los conflictos de TODA la clínica desde cualquier
	// vista, así que el aviso puede estar hablando de una agenda que no
	// es la que tiene delante. Sin este dato, tocarlo la llevaría al
	// calendario del profesional equivocado y el conflicto no estaría
	// por ningún lado: *"cualquier vista de clínica y cualquier vista del
	// calendario me tendría que llevar al conflicto, sin importar de qué
	// profesional es"*.
	//
	// Vacío cuando no hay conflictos, o cuando quien pregunta es un
	// profesional (ahí siempre es su propia agenda).
	ConflictoCalendarioProfesionalID string `json:"conflictoCalendarioProfesionalId,omitempty"`
	// ConflictoCalendarioFecha — el día del conflicto más próximo
	// (YYYY-MM-DD, Córdoba).
	//
	// Sin la fecha, el aviso solo sabe decir "hay un conflicto": quien lo
	// toca aterriza en el día de hoy y tiene que salir a buscarlo. Con
	// ella, el calendario se ubica en el día correcto y abre la pantalla
	// de resolución, que es lo que se pidió — *"me tendría que llevar a
	// ese día y abrir la pantalla de resolución de conflicto"*.
	ConflictoCalendarioFecha string `json:"conflictoCalendarioFecha,omitempty"`
}

func panelNotificacionesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var conflictosPacientes int64
		// soloConflictosVivos: el contador tiene que decir exactamente lo
		// mismo que la pantalla de Pacientes. Sin ese filtro contaba
		// tickets que quedaron sin ficha duplicada —resolver un conflicto
		// la borra, y una resolución arrastra a sus hermanos por mail— y
		// avisaba de algo que ahí no aparecía.
		if err := gdb.Model(&db.ConflictoPaciente{}).
			Scopes(soloMisConflictos(r), soloConflictosVivos).
			Where("clinic_id = ? AND resuelto = false", profesionalID).
			Count(&conflictosPacientes).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron calcular las notificaciones")
			return
		}

		conflictosCalendario, duenio, fechaConflicto, err := contarTurnosEnConflictoConBloqueos(gdb, r, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron calcular las notificaciones")
			return
		}

		respuesta := panelNotificacionesResponse{
			ConflictosPacientes:  conflictosPacientes,
			ConflictosCalendario: conflictosCalendario,
		}
		if duenio != nil {
			respuesta.ConflictoCalendarioProfesionalID = duenio.String()
		}
		if fechaConflicto != nil {
			respuesta.ConflictoCalendarioFecha = clock.In(*fechaConflicto).Format("2006-01-02")
		}
		writeJSON(w, http.StatusOK, respuesta)
	}
}

// contarTurnosEnConflictoConBloqueos — mismo criterio de "conflicto" que
// segmentosParaVisualizar del lado del front (calendar-grid.tsx: un turno
// VIGENTE que se superpone con un horario reservado vigente o con una
// excepción de horario de atención), pero acá se necesita un número
// global, sin acotarse al rango de fechas que la grilla tiene cargado en
// un momento dado — reusa bloqueosDelDia/intervaloMinutos.solapaCon/
// horaAMinutos/minutosDesdeMedianoche (disponibilidad.go, ya usados por
// calcularDisponibilidad) para no triplicar la lógica de "cuándo aplica
// un bloqueo general/específico" en un tercer lugar del código. TR-090:
// un conflicto cuyo turno ya pasó deja de contar como activo — de ahí el
// filtro `hora_fin >= ahora`, igual que el banner del calendario.
//
// DOS REGLAS QUE NO SON LA MISMA (QA de la 3.2.6, 2026-09-21). La ronda
// anterior las confundió y rompió la segunda:
//
//   - AISLAMIENTO: cada turno se compara SOLO contra su propia agenda. El
//     turno de uno contra el horario reservado de otro no es un
//     conflicto, y contarlo avisaba de algo que no existe y que no se
//     podía resolver desde ninguna pantalla.
//   - VISIBILIDAD: recepción tiene que enterarse de CUALQUIER conflicto
//     de la clínica, esté parada donde esté — *"el recepcionista tiene
//     que estar al tanto de cualquier conflicto, sea la vista que sea"*.
//     Acotar esto al profesional en foco escondía los conflictos reales
//     de los demás.
//
// Devuelve además de quién es la agenda del conflicto más próximo, para
// que el aviso pueda llevar hasta él.
func contarTurnosEnConflictoConBloqueos(
	gdb *gorm.DB, r *http.Request, clinicID uuid.UUID,
) (int64, *uuid.UUID, *time.Time, error) {
	ahora := clock.Now()

	// Recepción: toda la clínica, con foco o sin foco. Cualquier otro
	// rol: lo suyo, como siempre.
	acotarAMiAgenda := func(tx *gorm.DB) *gorm.DB { return tx }
	acotarAMisTurnos := acotarAMiAgenda
	if !tieneAlgunRol(r, db.RoleRecepcion) {
		acotarAMiAgenda = soloMiAgenda(r)
		acotarAMisTurnos = soloMisTurnos(r)
	}

	// LO QUE PUEDE CAUSAR UN CONFLICTO, PRIMERO — y los turnos después,
	// solo si hay algo contra qué compararlos (ronda de optimización
	// post-Fase 3, segunda parte, 2026-09-23).
	//
	// El orden de estas tres consultas no es un detalle de estilo: este
	// endpoint lo sondea CADA 2 SEGUNDOS cada persona que tiene el panel
	// abierto (`NotificacionesConflictoGlobal`). Al revés —los turnos
	// primero— la API cargaba en memoria TODOS los turnos futuros de la
	// clínica treinta veces por minuto y por empleado, incluso cuando no
	// hay un solo horario reservado y la respuesta es cero de entrada.
	//
	// Medido, con la respuesta en 0 y sin ningún horario reservado:
	// 376 turnos futuros → 9,3 ms; 2.976 → 65,8 ms. Es el costo de
	// hidratar filas para no mirarlas. Con el orden corregido el caso
	// común —una clínica que no reservó horarios— no toca `turnos`.
	//
	// El cortocircuito ya estaba escrito y el comentario del frontend ya
	// lo daba por hecho (*"sin horarios reservados no mira un solo
	// turno"*); lo único que fallaba era el orden en que se ejecutaba.
	hoy := clock.Today()
	var bloqueos []db.BloqueoHorario
	if err := gdb.Scopes(acotarAMiAgenda).Where(
		"clinic_id = ? AND ((especifico = true AND fecha >= ?) OR (especifico = false AND (fecha_hasta IS NULL OR fecha_hasta >= ?)))",
		clinicID, hoy, hoy,
	).Find(&bloqueos).Error; err != nil {
		return 0, nil, nil, err
	}

	// LAS EXCEPCIONES DE HORARIO TAMBIÉN CUENTAN (pedido de la QA: *"la
	// tarjeta global también tendría que contar los conflictos por
	// excepción de horario"*). El banner del calendario ya las miraba;
	// este contador no, así que un turno encima de un "No trabajo en este
	// período" se veía en el calendario y en ningún otro lado.
	var excepciones []db.HorarioAtencion
	if err := gdb.Scopes(acotarAMiAgenda).Where(
		"clinic_id = ? AND alcance <> ? AND fecha_hasta >= ?",
		clinicID, db.HorarioAtencionAlcanceGeneral, hoy,
	).Find(&excepciones).Error; err != nil {
		return 0, nil, nil, err
	}

	if len(bloqueos) == 0 && len(excepciones) == 0 {
		return 0, nil, nil, nil
	}

	// Recién acá los turnos: ya sabemos que hay contra qué compararlos.
	//
	// SOLO LAS TRES COLUMNAS QUE EL BUCLE MIRA. `db.Turno` tiene 28,
	// incluidos los datos de contacto del paciente y el motivo (texto
	// libre): traerlos para no usarlos es ancho de banda y memoria en un
	// endpoint que se sondea cada 2 segundos por persona. Lo único que
	// hace falta para decidir si un turno choca es cuándo empieza, cuándo
	// termina y de quién es la agenda.
	var turnos []db.Turno
	if err := gdb.Scopes(acotarAMisTurnos).
		Model(&db.Turno{}).
		Select("hora_inicio", "hora_fin", "atendido_por_user_id").
		Where("clinic_id = ? AND estado = 'agendado' AND hora_fin >= ?", clinicID, ahora).
		Order("hora_inicio").
		Find(&turnos).Error; err != nil {
		return 0, nil, nil, err
	}
	if len(turnos) == 0 {
		return 0, nil, nil, nil
	}

	// CADA AGENDA CONTRA SÍ MISMA. Las filas sin dueño (`user_id` NULL,
	// anteriores a la 3.2.1) valen para cualquiera: mismo criterio con el
	// que las muestran los scopes.
	generalesPorAgenda := map[uuid.UUID][]db.BloqueoHorario{}
	especificasPorAgenda := map[uuid.UUID][]db.BloqueoHorario{}
	var generalesDeTodos, especificasDeTodos []db.BloqueoHorario
	for _, b := range bloqueos {
		if b.UserID == nil {
			if b.Especifico {
				especificasDeTodos = append(especificasDeTodos, b)
			} else {
				generalesDeTodos = append(generalesDeTodos, b)
			}
			continue
		}
		if b.Especifico {
			especificasPorAgenda[*b.UserID] = append(especificasPorAgenda[*b.UserID], b)
		} else {
			generalesPorAgenda[*b.UserID] = append(generalesPorAgenda[*b.UserID], b)
		}
	}

	excepcionesPorAgenda := map[uuid.UUID][]db.HorarioAtencion{}
	var excepcionesDeTodos []db.HorarioAtencion
	for _, h := range excepciones {
		if h.UserID == nil {
			excepcionesDeTodos = append(excepcionesDeTodos, h)
			continue
		}
		excepcionesPorAgenda[*h.UserID] = append(excepcionesPorAgenda[*h.UserID], h)
	}

	// LAS REGLAS DE CADA AGENDA, ARMADAS UNA VEZ. Antes esto se rehacía
	// DENTRO del bucle: tres copias de slice por turno, o sea unas nueve
	// mil asignaciones con tres mil turnos, treinta veces por minuto y
	// por empleado. Las agendas de una clínica son unas pocas y los
	// turnos son muchos: el trabajo va del lado chico.
	//
	// Las copias siguen siendo copias —appendear sobre `generalesDeTodos`
	// escribiría en su array de respaldo y arrastraría lo de una agenda a
	// la siguiente—, solo que ahora se hacen una vez por agenda.
	type reglasDeAgenda struct {
		generales   []db.BloqueoHorario
		especificas []db.BloqueoHorario
		excepciones []db.HorarioAtencion
	}
	reglasPorAgenda := map[uuid.UUID]reglasDeAgenda{}
	reglasDe := func(userID *uuid.UUID) reglasDeAgenda {
		if userID == nil {
			return reglasDeAgenda{
				generales:   generalesDeTodos,
				especificas: especificasDeTodos,
				excepciones: excepcionesDeTodos,
			}
		}
		if ya, hay := reglasPorAgenda[*userID]; hay {
			return ya
		}
		armadas := reglasDeAgenda{
			generales:   append(append([]db.BloqueoHorario{}, generalesDeTodos...), generalesPorAgenda[*userID]...),
			especificas: append(append([]db.BloqueoHorario{}, especificasDeTodos...), especificasPorAgenda[*userID]...),
			excepciones: append(append([]db.HorarioAtencion{}, excepcionesDeTodos...), excepcionesPorAgenda[*userID]...),
		}
		reglasPorAgenda[*userID] = armadas
		return armadas
	}

	var count int64
	var primerDuenio *uuid.UUID
	var primeraFecha *time.Time
	for _, t := range turnos {
		if t.HoraInicio == nil || t.HoraFin == nil {
			continue
		}
		reglas := reglasDe(t.AtendidoPorUserID)

		if turnoChocaConSuAgenda(*t.HoraInicio, *t.HoraFin, reglas.generales, reglas.especificas, reglas.excepciones) {
			count++
			// El PRIMERO en el tiempo: los turnos vienen ordenados por
			// `hora_inicio`, así que el primero que choca es el más
			// próximo — que es a dónde tiene que llevar el aviso.
			if primeraFecha == nil {
				primerDuenio = t.AtendidoPorUserID
				primeraFecha = t.HoraInicio
			}
		}
	}
	return count, primerDuenio, primeraFecha, nil
}

// turnoChocaConSuAgenda — si este turno se superpone con algún horario
// reservado o queda fuera del horario que deja una excepción de ese día.
func turnoChocaConSuAgenda(
	inicio, fin time.Time,
	generales, especificas []db.BloqueoHorario,
	excepciones []db.HorarioAtencion,
) bool {
	dia := clock.In(inicio)
	intervaloTurno := intervaloMinutos{
		Desde: minutosDesdeMedianoche(inicio),
		Hasta: minutosDesdeMedianoche(fin),
	}

	for _, b := range bloqueosDelDia(dia, generales, especificas) {
		intervaloBloqueo := intervaloMinutos{
			Desde: horaAMinutos(b.HoraDesde),
			Hasta: horaAMinutos(b.HoraHasta),
		}
		if intervaloTurno.solapaCon(intervaloBloqueo) {
			return true
		}
	}

	// Una excepción que cubre el día lo cierra entero (sin horas) o lo
	// achica a [horaDesde, horaHasta] — mismo criterio que
	// `cierresDeExcepciones` en calendar-grid.tsx. El turno choca si no
	// entra completo en esa ventana.
	fecha := dia.Format("2006-01-02")
	for _, h := range excepciones {
		if h.FechaDesde == nil || h.FechaHasta == nil {
			continue
		}
		// `.Format` directo y NO `clock.In(...)`: `fecha_desde`/`fecha_hasta`
		// son columnas DATE, que GORM trae como medianoche UTC. Pasarlas a
		// Córdoba (UTC-3) las corre al día anterior, y la excepción dejaba
		// de cubrir su propio día. Mismo criterio que `formatFechaPtr`, que
		// es como se serializan estas fechas en toda la API.
		if fecha < h.FechaDesde.Format("2006-01-02") ||
			fecha > h.FechaHasta.Format("2006-01-02") {
			continue
		}
		if h.HoraDesde == nil || h.HoraHasta == nil {
			return true
		}
		abre, cierra := horaAMinutos(*h.HoraDesde), horaAMinutos(*h.HoraHasta)
		if intervaloTurno.Desde < abre || intervaloTurno.Hasta > cierra {
			return true
		}
	}
	return false
}
