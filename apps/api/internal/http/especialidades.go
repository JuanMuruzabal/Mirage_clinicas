package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

type especialidadResponse struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
}

func toEspecialidadResponse(e db.Especialidad) especialidadResponse {
	return especialidadResponse{ID: e.ID.String(), Nombre: e.Nombre}
}

// registerEspecialidadRoutes monta GET /especialidades — catálogo cerrado
// público (TR-004 en docs/tradeoffs.md), sin autenticación: el flujo de
// alta (spec §3) todavía no tiene sesión cuando lo necesita.
func registerEspecialidadRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/especialidades", listEspecialidadesHandler(gdb))
}

func listEspecialidadesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var especialidades []db.Especialidad
		if err := gdb.Where("activa = ?", true).Order("nombre").Find(&especialidades).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el catálogo de especialidades")
			return
		}

		out := make([]especialidadResponse, len(especialidades))
		for i, e := range especialidades {
			out[i] = toEspecialidadResponse(e)
		}
		writeJSON(w, http.StatusOK, out)
	}
}
