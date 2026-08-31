package http

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// colorRegex valida un hex de 6 dígitos ("#RRGGBB") — mismo formato que
// TipoConsulta.Color siempre tuvo (Sistema Cascarón, TR-010).
var colorRegex = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

const (
	duracionMinutosMax           = 8 * 60 // 8 horas — tope defensivo, no una regla de negocio real
	tiempoPostConsultaMinutosMax = 4 * 60 // 4 horas
)

type tipoConsultaResponse struct {
	ID                        string `json:"id"`
	Nombre                    string `json:"nombre"`
	Color                     string `json:"color"`
	DuracionMinutos           int    `json:"duracionMinutos"`
	TiempoPostConsultaMinutos int    `json:"tiempoPostConsultaMinutos"`
	CantidadSesiones          *int   `json:"cantidadSesiones,omitempty"`
}

func toTipoConsultaResponse(t db.TipoConsulta) tipoConsultaResponse {
	return tipoConsultaResponse{
		ID:                        t.ID.String(),
		Nombre:                    t.Nombre,
		Color:                     t.Color,
		DuracionMinutos:           t.DuracionMinutos,
		TiempoPostConsultaMinutos: t.TiempoPostConsultaMinutos,
		CantidadSesiones:          t.CantidadSesiones,
	}
}

// registerTipoConsultaRoutes monta el catálogo de tipos de consulta —
// POR PROFESIONAL (TR-001 en docs/tradeoffs.md, distinto del catálogo
// global de especialidades). GET ya existía (usado por "+ Agregar turno"
// y el calendario para pintar cada turno con su color); POST/PATCH/DELETE
// son F2.3.4 (docs/implementation-plan.md §11.3) — hasta ahora el
// catálogo solo se armaba con los 2 tipos sembrados al registrarse
// (SeedTiposConsultaDefault), sin forma de gestionarlo desde la UI.
func registerTipoConsultaRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/tipos-consulta", listTiposConsultaHandler(gdb))
	r.Post("/tipos-consulta", crearTipoConsultaHandler(gdb))
	r.Patch("/tipos-consulta/{id}", editarTipoConsultaHandler(gdb))
	r.Delete("/tipos-consulta/{id}", eliminarTipoConsultaHandler(gdb))
}

func listTiposConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
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

// tipoConsultaRequest respalda tanto POST (alta) como PATCH (edición
// completa, mismo criterio que editarPacienteHandler en pacientes.go: se
// reemplazan todos los campos editables, no un PATCH parcial de verdad).
type tipoConsultaRequest struct {
	Nombre                    string `json:"nombre"`
	Color                     string `json:"color"`
	DuracionMinutos           int    `json:"duracionMinutos"`
	TiempoPostConsultaMinutos int    `json:"tiempoPostConsultaMinutos"`
	CantidadSesiones          *int   `json:"cantidadSesiones"`
}

// validar corrige espacios y devuelve un mensaje de error controlado (nunca
// un 500) si algún campo no es válido — F2.3.4, mismos topes que
// duracionMinutosMax/tiempoPostConsultaMinutosMax de arriba.
func (req *tipoConsultaRequest) validar() string {
	req.Nombre = strings.TrimSpace(req.Nombre)
	req.Color = strings.TrimSpace(req.Color)

	if req.Nombre == "" {
		return "el nombre no puede estar vacío"
	}
	if !colorRegex.MatchString(req.Color) {
		return "el color debe ser un hex de 6 dígitos, por ejemplo #E7D9BE"
	}
	if req.DuracionMinutos <= 0 || req.DuracionMinutos > duracionMinutosMax {
		return "la duración debe ser mayor a 0 y menor a 8 horas"
	}
	if req.TiempoPostConsultaMinutos < 0 || req.TiempoPostConsultaMinutos > tiempoPostConsultaMinutosMax {
		return "el tiempo posterior a la consulta debe estar entre 0 y 4 horas"
	}
	if req.CantidadSesiones != nil && *req.CantidadSesiones < 1 {
		return "la cantidad de sesiones debe ser mayor a 0"
	}
	return ""
}

func crearTipoConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		var req tipoConsultaRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		if msg := req.validar(); msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}

		tipo := db.TipoConsulta{
			ProfesionalID:             profesionalID,
			Nombre:                    req.Nombre,
			Color:                     req.Color,
			DuracionMinutos:           req.DuracionMinutos,
			TiempoPostConsultaMinutos: req.TiempoPostConsultaMinutos,
			CantidadSesiones:          req.CantidadSesiones,
		}
		if err := gdb.Create(&tipo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo crear el tipo de consulta")
			return
		}

		writeJSON(w, http.StatusCreated, toTipoConsultaResponse(tipo))
	}
}

func editarTipoConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		tipoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de tipo de consulta inválido")
			return
		}

		var req tipoConsultaRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		if msg := req.validar(); msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}

		var tipo db.TipoConsulta
		if err := gdb.Where("id = ? AND profesional_id = ?", tipoID, profesionalID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		tipo.Nombre = req.Nombre
		tipo.Color = req.Color
		tipo.DuracionMinutos = req.DuracionMinutos
		tipo.TiempoPostConsultaMinutos = req.TiempoPostConsultaMinutos
		tipo.CantidadSesiones = req.CantidadSesiones

		if err := gdb.Save(&tipo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el tipo de consulta")
			return
		}

		writeJSON(w, http.StatusOK, toTipoConsultaResponse(tipo))
	}
}

// eliminarTipoConsultaHandler — R2F-4 en docs/implementation-plan.md §11.4
// dejó pendiente esta regla: no se puede borrar un tipo de consulta que ya
// tiene turnos asociados (agendados, pendientes o cancelados) — un delete
// duro dejaría esos turnos con un tipo_consulta_id huérfano (sin FK real
// en la base, spec de siempre) y el calendario/ficha de turno no podrían
// resolver más su nombre/color.
func eliminarTipoConsultaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		tipoID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de tipo de consulta inválido")
			return
		}

		var tipo db.TipoConsulta
		if err := gdb.Where("id = ? AND profesional_id = ?", tipoID, profesionalID).First(&tipo).Error; err != nil {
			writeError(w, http.StatusNotFound, "tipo de consulta no encontrado")
			return
		}

		var turnosAsociados int64
		if err := gdb.Model(&db.Turno{}).Where("tipo_consulta_id = ?", tipoID).Count(&turnosAsociados).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo verificar los turnos asociados")
			return
		}
		if turnosAsociados > 0 {
			writeError(w, http.StatusConflict, "no se puede eliminar un tipo de consulta con turnos asociados")
			return
		}

		if err := gdb.Delete(&tipo).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo eliminar el tipo de consulta")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
