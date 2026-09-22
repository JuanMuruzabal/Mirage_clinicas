package http

import (
	"net/http"

	"gorm.io/gorm"

	"dental-mirage/api/internal/clock"
	"dental-mirage/api/internal/db"
)

// Los contadores de las pestañas de /panel/turnos, en UNA consulta.
//
// Ronda de optimización post-Fase 3 (2026-09-22). La pantalla muestra
// cuatro pestañas —Pendientes, Resueltos, Canceladas, Todas— cada una con
// su número al lado, y pedía los cuatro con cuatro requests a
// `/turnos?limit=1`, aprovechando que la paginación devuelve el total en
// `X-Total-Count`. Funcionaba, y por eso duró: el trabajo REAL de contar
// es una fracción de lo que costaba pedirlo.
//
// Medido con 600 pacientes y 1.800 turnos: cada uno de esos requests
// tardaba entre 7,6 y 10,4 ms, de los cuales ~4 ms son el viaje HTTP
// (`/health`, sin sesión ni consulta, mide 3,9 ms) y ~2 ms más las dos
// consultas que todo request autenticado paga antes de trabajar
// (`requireSession` + `requireClinic`). O sea: cuatro veces el peaje para
// cuatro números que salen de recorrer las mismas filas.
//
// Las cuatro pestañas filtran IGUAL en todo lo demás —la búsqueda, el
// rango de fechas, el tipo de consulta, la verificación del paciente— y
// se diferencian solo por estado/resuelto. Eso es exactamente lo que
// `COUNT(*) FILTER (WHERE ...)` expresa: una pasada por las filas, cuatro
// acumuladores.
//
// **Por qué esto y no las cuatro consultas en paralelo**: los tests de
// este repo corren dentro de una transacción que se revierte
// (`internal/testdb`), y una transacción vive en UNA conexión — no admite
// consultas concurrentes. Paralelizar habría dejado el camino de
// producción sin poder testearse. Bajar de cuatro viajes a uno es más
// rápido que hacer los cuatro a la vez, y se puede testear.
type contadoresDeTurnosResponse struct {
	Agendado  int64 `json:"agendado"`
	Resuelto  int64 `json:"resuelto"`
	Cancelada int64 `json:"cancelada"`
	Todas     int64 `json:"todas"`
}

func contadoresDeTurnosHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		// Los MISMOS filtros que el listado, por la misma función: si
		// divergen, la pestaña dice un número y la lista de abajo muestra
		// otro.
		query, ok := filtrosComunesDeTurnos(w, r, gdb, profesionalID)
		if !ok {
			return
		}

		// "Resuelto" sale del reloj, no de una columna (TR-158): un turno
		// está resuelto cuando su hora de fin ya pasó. Se lee una sola vez
		// para que los cuatro contadores hablen del mismo instante.
		ahora := clock.Now()

		var out contadoresDeTurnosResponse
		if err := query.Model(&db.Turno{}).Select(
			`COUNT(*) FILTER (WHERE estado = 'agendado' AND (hora_fin IS NULL OR hora_fin >= ?)) AS agendado,
			 COUNT(*) FILTER (WHERE estado = 'agendado' AND hora_fin < ?) AS resuelto,
			 COUNT(*) FILTER (WHERE estado = 'cancelada') AS cancelada,
			 COUNT(*) AS todas`,
			ahora, ahora,
		).Scan(&out).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron contar los turnos")
			return
		}

		writeJSON(w, http.StatusOK, out)
	}
}
