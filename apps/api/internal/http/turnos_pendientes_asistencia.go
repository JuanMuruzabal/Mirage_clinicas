package http

import (
	"errors"
	"net/http"
	"time"

	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// turnosPendientesAsistenciaResponse — corrección de QA sobre TR-107
// (1.3ter): pedido textual del cliente, "el cartel siempre debe aparecer
// si tengo un turno resuelto, y no lo puedo quitar aunque cierre la
// app... siempre que vuelva es lo primero que debo ver". `AsistenciaCartelGlobal`
// (frontend) deja de sondear /turnos con un filtro de fecha del lado del
// cliente (traía la tabla entera de turnos "agendado" para filtrar
// después en el navegador, cada vez más caro con el tiempo) y pasa a
// pedir esto — ya filtrado del lado del server, sin ningún tope de
// fecha: un turno resuelto sin marcar de HACE SEMANAS sigue apareciendo
// acá (y por lo tanto en el cartel) hasta que se marque, sea cual sea el
// motivo por el que nadie lo marcó a tiempo.
type turnosPendientesAsistenciaResponse struct {
	// Vencidos — turnos YA resueltos (hora_fin < ahora) sin asistencia
	// marcada, del más antiguo al más nuevo (el cartel los muestra en
	// ese orden, uno por vez, acumulados hasta marcarlos todos — pedido
	// textual: "si hay más de uno se deben acumular hasta marcarlos
	// todos"). Sin límite: a diferencia de las tarjetas del dashboard
	// (resumenListLimit, un preview), acá cada fila representa un cartel
	// bloqueante pendiente — recortar la lista dejaría turnos reales sin
	// poder marcarse.
	Vencidos []turnoResponse `json:"vencidos"`
	// ProximoVencimiento — hora de fin (RFC3339) del turno VIGENTE más
	// próximo a resolverse, o nil si no hay ninguno agendado a futuro.
	// El frontend arma con esto un timer preciso para el instante exacto
	// en que ese turno cruza su hora de fin, en vez de esperar al
	// próximo sondeo periódico (hasta 30s de demora) — "en tiempo real",
	// pedido explícito del cliente.
	ProximoVencimiento *string `json:"proximoVencimiento"`
}

// turnosPendientesAsistenciaHandler — GET /turnos/pendientes-asistencia.
func turnosPendientesAsistenciaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		ahora := clock.Now()

		var vencidos []db.Turno
		if err := gdb.Where(
			"profesional_id = ? AND estado = 'agendado' AND hora_fin < ? AND asistencia IS NULL",
			profesionalID, ahora,
		).
			Order("hora_fin").
			Find(&vencidos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener los turnos pendientes de asistencia")
			return
		}

		// El turno vigente (a futuro) más próximo a resolverse nunca
		// tiene asistencia marcada todavía (marcarAsistenciaHandler exige
		// que ya haya pasado su hora de fin) — no hace falta filtrar por
		// eso acá, alcanza con "todavía no vigente".
		var proximo db.Turno
		err := gdb.Where("profesional_id = ? AND estado = 'agendado' AND hora_fin >= ?", profesionalID, ahora).
			Order("hora_fin").
			First(&proximo).Error
		var proximoVencimiento *string
		if err == nil && proximo.HoraFin != nil {
			s := proximo.HoraFin.Format(time.RFC3339)
			proximoVencimiento = &s
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener los turnos pendientes de asistencia")
			return
		}

		out := make([]turnoResponse, len(vencidos))
		for i, t := range vencidos {
			out[i] = toTurnoResponse(t)
		}
		writeJSON(w, http.StatusOK, turnosPendientesAsistenciaResponse{
			Vencidos:           out,
			ProximoVencimiento: proximoVencimiento,
		})
	}
}
