package http

import (
	"net/http"

	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Los contadores de las pestañas de /panel/pacientes, en UNA consulta.
//
// Ronda de optimización post-Fase 3 (2026-09-22) — el mismo caso que
// `/turnos/contadores`, y por los mismos motivos: tres pestañas (Todos,
// Verificados, Sin verificar) que filtran igual salvo por la
// verificación, y tres requests a `/pacientes?limit=1` para leer tres
// números del header `X-Total-Count`.
//
// La diferencia con turnos está en cómo se decide "verificado": no es una
// columna sino una subconsulta (`pacientesVerificadosQuery` — tiene turno
// resuelto y asistido, o ficha cargada a mano). Así que el FILTER
// pregunta por pertenencia a ese conjunto, y las tres pestañas comparten
// una sola evaluación de la subconsulta en vez de tres.
type contadoresDePacientesResponse struct {
	Todos        int64 `json:"todos"`
	Verificados  int64 `json:"verificados"`
	SinVerificar int64 `json:"sinVerificar"`
}

func contadoresDePacientesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		// El MISMO filtro que el listado, por la misma función: si
		// divergen, la pestaña dice un número y la tabla de abajo muestra
		// otro.
		query := filtrosComunesDePacientes(r, gdb, profesionalID)

		sub := pacientesVerificadosQuery(gdb, profesionalID)
		var out contadoresDePacientesResponse
		if err := query.Model(&db.Paciente{}).Select(
			`COUNT(*) AS todos,
			 COUNT(*) FILTER (WHERE pacientes.id IN (?)) AS verificados,
			 COUNT(*) FILTER (WHERE pacientes.id NOT IN (?)) AS sin_verificar`,
			sub, sub,
		).Scan(&out).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron contar los pacientes")
			return
		}

		writeJSON(w, http.StatusOK, out)
	}
}
