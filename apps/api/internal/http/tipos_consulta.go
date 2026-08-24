package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

type tipoConsultaResponse struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
	Color  string `json:"color"`
}

func toTipoConsultaResponse(t db.TipoConsulta) tipoConsultaResponse {
	return tipoConsultaResponse{ID: t.ID.String(), Nombre: t.Nombre, Color: t.Color}
}

// registerTipoConsultaRoutes monta GET /tipos-consulta — catálogo POR
// PROFESIONAL (TR-001 en docs/tradeoffs.md, distinto del catálogo global
// de especialidades), usado por el modal "+ Agregar turno" (spec §4.3) y
// por el calendario para pintar cada turno con su color.
func registerTipoConsultaRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/tipos-consulta", listTiposConsultaHandler(gdb))
}

func listTiposConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := claimsFromContext(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}
		profesionalID, err := uuid.Parse(claims.Subject)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "token inválido")
			return
		}

		var tipos []db.TipoConsulta
		if err := gdb.Where("profesional_id = ?", profesionalID).Order("created_at").Find(&tipos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los tipos de consulta")
			return
		}

		out := make([]tipoConsultaResponse, len(tipos))
		for i, t := range tipos {
			out[i] = toTipoConsultaResponse(t)
		}
		writeJSON(w, http.StatusOK, out)
	}
}
