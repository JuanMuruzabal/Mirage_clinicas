package http

import (
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// registerPacienteRoutes monta las rutas de Pacientes (spec §4.5) —
// autenticadas, acotadas al profesional del token.
func registerPacienteRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/pacientes", listPacientesHandler(gdb))
	r.Get("/pacientes/{id}", getPacienteHandler(gdb))
	r.Patch("/pacientes/{id}", editarPacienteHandler(gdb))
}

type pacienteResponse struct {
	ID        string  `json:"id"`
	Nombre    string  `json:"nombre"`
	Apellido  string  `json:"apellido"`
	DNI       string  `json:"dni"`
	Telefono  string  `json:"telefono"`
	Email     *string `json:"email,omitempty"`
	CreatedAt string  `json:"createdAt"`
}

func toPacienteResponse(p db.Paciente) pacienteResponse {
	return pacienteResponse{
		ID:        p.ID.String(),
		Nombre:    p.Nombre,
		Apellido:  p.Apellido,
		DNI:       p.DNI,
		Telefono:  p.Telefono,
		Email:     p.Email,
		CreatedAt: p.CreatedAt.Format(time.RFC3339),
	}
}

// listPacientesHandler — GET /pacientes?q= (T3.5): tabla de pacientes,
// buscador por nombre/apellido/DNI igual que Turnos.
func listPacientesHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}

		query := gdb.Where("profesional_id = ?", profesionalID)
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			like := "%" + q + "%"
			query = query.Where("nombre ILIKE ? OR apellido ILIKE ? OR dni ILIKE ?", like, like, like)
		}

		var pacientes []db.Paciente
		if err := query.Order("apellido, nombre").Find(&pacientes).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener los pacientes")
			return
		}

		out := make([]pacienteResponse, len(pacientes))
		for i, p := range pacientes {
			out[i] = toPacienteResponse(p)
		}
		writeJSON(w, http.StatusOK, out)
	}
}

type pacienteDetalleResponse struct {
	pacienteResponse
	Turnos []turnoResponse `json:"turnos"`
}

// getPacienteHandler — GET /pacientes/{id} (T3.6): datos personales +
// TODO su historial de turnos — el front separa "activos" (agendado,
// futuro) de "historial" (el resto) con la misma lista, sin pedirle dos
// veces al backend. Los placeholders de historia clínica/presupuesto
// (spec §4.5) son puramente visuales, no tienen contraparte acá.
func getPacienteHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pacienteID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de paciente inválido")
			return
		}

		var paciente db.Paciente
		if err := gdb.Where("id = ? AND profesional_id = ?", pacienteID, profesionalID).First(&paciente).Error; err != nil {
			writeError(w, http.StatusNotFound, "paciente no encontrado")
			return
		}

		var turnos []db.Turno
		if err := gdb.Where("paciente_id = ?", pacienteID).Order("created_at DESC").Find(&turnos).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el historial de turnos")
			return
		}
		turnosOut := make([]turnoResponse, len(turnos))
		for i, t := range turnos {
			turnosOut[i] = toTurnoResponse(t)
		}

		writeJSON(w, http.StatusOK, pacienteDetalleResponse{
			pacienteResponse: toPacienteResponse(paciente),
			Turnos:           turnosOut,
		})
	}
}

type editarPacienteRequest struct {
	DNI      string `json:"dni"`
	Telefono string `json:"telefono"`
	Email    string `json:"email"`
}

// editarPacienteHandler — PATCH /pacientes/{id} (pedido explícito del
// cliente, 2026-08-23): corrige DNI, teléfono y email de la ficha del
// paciente "por si hay alguna actualización en estos datos" — a diferencia
// de editar un turno puntual (que solo toca el snapshot de contacto de ESE
// turno), esto actualiza el dato real del paciente para todos sus turnos
// futuros. Nombre y apellido no son editables acá todavía (fuera de
// alcance de este pedido). Mismas reglas de formato que TR-002.
func editarPacienteHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		profesionalID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		pacienteID, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de paciente inválido")
			return
		}

		var req editarPacienteRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.DNI = strings.TrimSpace(req.DNI)
		req.Telefono = strings.TrimSpace(req.Telefono)
		req.Email = strings.TrimSpace(strings.ToLower(req.Email))

		if !dniRegex.MatchString(req.DNI) {
			writeError(w, http.StatusBadRequest, "el DNI debe tener 7 u 8 dígitos, sin puntos")
			return
		}
		if !telefonoRegex.MatchString(req.Telefono) {
			writeError(w, http.StatusBadRequest, "el teléfono no tiene un formato válido")
			return
		}
		if req.Email != "" {
			if _, err := mail.ParseAddress(req.Email); err != nil {
				writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
				return
			}
		}

		var paciente db.Paciente
		if err := gdb.Where("id = ? AND profesional_id = ?", pacienteID, profesionalID).First(&paciente).Error; err != nil {
			writeError(w, http.StatusNotFound, "paciente no encontrado")
			return
		}

		paciente.DNI = req.DNI
		paciente.Telefono = req.Telefono
		if req.Email != "" {
			paciente.Email = &req.Email
		} else {
			paciente.Email = nil
		}

		if err := gdb.Save(&paciente).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el paciente")
			return
		}

		writeJSON(w, http.StatusOK, toPacienteResponse(paciente))
	}
}
