package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
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

// aplicarLosBorradoresQueVencieron convierte en definitiva la asistencia
// que el profesional dejó anotada por adelantado en la tarjeta de "Turnos
// de hoy", para los turnos que acaban de cruzar su hora de fin. Devuelve
// los que SIGUEN pendientes (los que no tenían borrador, más los que no
// se pudieron aplicar).
//
// ## Por qué acá, y no en un trabajo periódico
//
// Este endpoint es el que ya se pregunta, cada 30 segundos desde cada
// panel abierto, "¿qué turnos acaban de terminar y hay que marcar?". Es
// exactamente el momento en que un borrador deja de ser un borrador, así
// que aplicarlo acá no agrega ningún mecanismo nuevo: el turno que tenía
// anotado "asistió" simplemente no vuelve como pendiente, y el cartel no
// aparece — que es todo lo que el profesional pidió al anotarlo antes.
//
// Escribir desde un GET no es gratis y hay que decirlo: es el mismo
// patrón que `GET /equipo/presencia`, que es "el latido Y la lectura"
// (TR-142). La alternativa era un proceso aparte que barriera la tabla
// por hora; se descartó porque hoy corre una sola instancia del backend
// y porque el efecto de aplicar el borrador solo importa cuando alguien
// mira — si nadie abre el panel, tampoco hay cartel que evitar.
//
// ## Qué pasa si no se puede aplicar
//
// Un turno cuyo paciente tiene un conflicto de identidad sin resolver
// rebota (errConflictoPacienteSinResolver) y se queda en la lista: el
// cartel aparece y lo pide a mano, que es lo correcto — esa decisión
// necesita a una persona mirando, no un borrador de hace una hora.
// Cualquier otro error se trata igual, sin tumbar la respuesta: el
// sondeo no puede romper el panel entero por un turno.
func aplicarLosBorradoresQueVencieron(gdb *gorm.DB, vencidos []db.Turno, clinicID uuid.UUID) []db.Turno {
	siguenPendientes := make([]db.Turno, 0, len(vencidos))
	for i := range vencidos {
		t := &vencidos[i]
		if t.AsistenciaPreliminar == nil {
			siguenPendientes = append(siguenPendientes, *t)
			continue
		}
		if err := aplicarAsistencia(gdb, t, clinicID, *t.AsistenciaPreliminar); err != nil {
			siguenPendientes = append(siguenPendientes, *t)
			continue
		}
	}
	return siguenPendientes
}

// turnosPendientesAsistenciaHandler — GET /turnos/pendientes-asistencia.
func turnosPendientesAsistenciaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		ahora := clock.Now()

		// Los MÍOS: marcar asistencia es irreversible, y este listado es
		// el que invita a hacerlo. Con los del colega adentro, la primera
		// acción del día podía ser cerrarle un turno ajeno.
		var vencidos []db.Turno
		if err := gdb.Scopes(soloMisTurnos(r)).Where(
			"clinic_id = ? AND estado = 'agendado' AND hora_fin < ? AND asistencia IS NULL",
			profesionalID, ahora,
		).
			Order("hora_fin").
			Find(&vencidos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron obtener los turnos pendientes de asistencia")
			return
		}

		vencidos = aplicarLosBorradoresQueVencieron(gdb, vencidos, profesionalID)

		// El turno vigente (a futuro) más próximo a resolverse nunca
		// tiene asistencia marcada todavía (marcarAsistenciaHandler exige
		// que ya haya pasado su hora de fin) — no hace falta filtrar por
		// eso acá, alcanza con "todavía no vigente".
		var proximo db.Turno
		err := gdb.Scopes(soloMisTurnos(r)).
			Where("clinic_id = ? AND estado = 'agendado' AND hora_fin >= ?", profesionalID, ahora).
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
