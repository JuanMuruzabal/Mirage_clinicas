package http

import (
	"net/http"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// panelNotificacionesResponse — pedido textual del cliente: "si estoy
// afuera de la sección pacientes mostrar las notificaciones de conflicto
// en la zona [de arriba del todo, marcada en docs/foto1.png]... si es
// conflicto de pacientes que diga tenés un conflicto con los pacientes y
// me envíe al apartado paciente, si es conflicto con turno de calendario
// al calendario". Endpoint chico y barato a propósito — se sondea desde
// cualquier pantalla del panel (NotificacionesConflictoGlobal, montado en
// app/panel/layout.tsx), no solo desde Pacientes/Calendario.
type panelNotificacionesResponse struct {
	ConflictosPacientes  int64 `json:"conflictosPacientes"`
	ConflictosCalendario int64 `json:"conflictosCalendario"`
}

func panelNotificacionesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var conflictosPacientes int64
		if err := gdb.Model(&db.ConflictoPaciente{}).
			Where("profesional_id = ? AND resuelto = false", profesionalID).
			Count(&conflictosPacientes).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron calcular las notificaciones")
			return
		}

		conflictosCalendario, err := contarTurnosEnConflictoConBloqueos(gdb, profesionalID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron calcular las notificaciones")
			return
		}

		writeJSON(w, http.StatusOK, panelNotificacionesResponse{
			ConflictosPacientes:  conflictosPacientes,
			ConflictosCalendario: conflictosCalendario,
		})
	}
}

// contarTurnosEnConflictoConBloqueos — mismo criterio de "conflicto" que
// segmentosParaVisualizar del lado del front (calendar-grid.tsx: un turno
// VIGENTE que se superpone con un horario reservado vigente), pero acá
// se necesita un número global, sin acotarse al rango de fechas que la
// grilla tiene cargado en un momento dado — reusa bloqueosDelDia/
// intervaloMinutos.solapaCon/horaAMinutos/minutosDesdeMedianoche
// (disponibilidad.go, ya usados por calcularDisponibilidad) para no
// triplicar la lógica de "cuándo aplica un bloqueo general/específico" en
// un tercer lugar del código. TR-090: un conflicto cuyo turno ya pasó
// deja de contar como activo — de ahí el filtro `hora_fin >= ahora`,
// igual que el banner del calendario.
func contarTurnosEnConflictoConBloqueos(gdb *gorm.DB, profesionalID uuid.UUID) (int64, error) {
	ahora := clock.Now()
	var turnos []db.Turno
	if err := gdb.Where("profesional_id = ? AND estado = 'agendado' AND hora_fin >= ?", profesionalID, ahora).
		Find(&turnos).Error; err != nil {
		return 0, err
	}
	if len(turnos) == 0 {
		return 0, nil
	}

	hoy := clock.Today()
	var bloqueos []db.BloqueoHorario
	if err := gdb.Where(
		"clinic_id = ? AND ((especifico = true AND fecha >= ?) OR (especifico = false AND (fecha_hasta IS NULL OR fecha_hasta >= ?)))",
		profesionalID, hoy, hoy,
	).Find(&bloqueos).Error; err != nil {
		return 0, err
	}
	if len(bloqueos) == 0 {
		return 0, nil
	}

	var generales, especificas []db.BloqueoHorario
	for _, b := range bloqueos {
		if b.Especifico {
			especificas = append(especificas, b)
		} else {
			generales = append(generales, b)
		}
	}

	var count int64
	for _, t := range turnos {
		if t.HoraInicio == nil || t.HoraFin == nil {
			continue
		}
		delDia := bloqueosDelDia(clock.In(*t.HoraInicio), generales, especificas)
		if len(delDia) == 0 {
			continue
		}
		intervaloTurno := intervaloMinutos{Desde: minutosDesdeMedianoche(*t.HoraInicio), Hasta: minutosDesdeMedianoche(*t.HoraFin)}
		for _, b := range delDia {
			intervaloBloqueo := intervaloMinutos{Desde: horaAMinutos(b.HoraDesde), Hasta: horaAMinutos(b.HoraHasta)}
			if intervaloTurno.solapaCon(intervaloBloqueo) {
				count++
				break
			}
		}
	}
	return count, nil
}
