package http

import (
	"net/http"
	"net/mail"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// dniRegex/telefonoRegex (TR-002 en docs/tradeoffs.md): DNI numérico de
// 7-8 dígitos; teléfono argentino de 10-13 dígitos, acepta un "+" líder
// (p. ej. +54 9 351 555-0142 sin espacios/guiones, que el frontend limpia
// antes de mandar).
var (
	dniRegex      = regexp.MustCompile(`^\d{7,8}$`)
	telefonoRegex = regexp.MustCompile(`^\+?\d{10,13}$`)
)

// registerTurnoPublicoRoutes monta POST /clinicas/{slug}/turnos — el
// formulario público de pedido de turno (spec §4.4, T3.1/T3.2). Sin
// autenticación: lo completa un paciente entrando a la página pública de
// la clínica, no un profesional logueado.
func registerTurnoPublicoRoutes(r chi.Router, gdb *gorm.DB) {
	r.Post("/clinicas/{slug}/turnos", solicitarTurnoPublicoHandler(gdb))
}

type solicitarTurnoPublicoRequest struct {
	NombreContacto   string `json:"nombreContacto"`
	ApellidoContacto string `json:"apellidoContacto"`
	DNIContacto      string `json:"dniContacto"`
	TelefonoContacto string `json:"telefonoContacto"`
	EmailContacto    string `json:"emailContacto"`
	Motivo           string `json:"motivo"`
}

type solicitarTurnoPublicoResponse struct {
	ID string `json:"id"`
}

// solicitarTurnoPublicoHandler crea el turno `pendiente` (spec §4.4: "se
// genera el registro en este apartado de Turnos", en paralelo al envío
// por WhatsApp que resuelve el frontend con el link `wa.me`, TR-003 — este
// endpoint no sabe nada de WhatsApp, solo persiste el pedido).
func solicitarTurnoPublicoHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		var clinic db.Clinic
		if err := gdb.Where("slug = ?", slug).First(&clinic).Error; err != nil {
			writeError(w, http.StatusNotFound, "clínica no encontrada")
			return
		}

		var req solicitarTurnoPublicoRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.NombreContacto = strings.TrimSpace(req.NombreContacto)
		req.ApellidoContacto = strings.TrimSpace(req.ApellidoContacto)
		req.DNIContacto = strings.TrimSpace(req.DNIContacto)
		req.TelefonoContacto = strings.TrimSpace(req.TelefonoContacto)
		req.EmailContacto = strings.TrimSpace(strings.ToLower(req.EmailContacto))

		if req.NombreContacto == "" || req.ApellidoContacto == "" {
			writeError(w, http.StatusBadRequest, "nombre y apellido son obligatorios")
			return
		}
		if !dniRegex.MatchString(req.DNIContacto) {
			writeError(w, http.StatusBadRequest, "el DNI debe tener 7 u 8 dígitos, sin puntos")
			return
		}
		if !telefonoRegex.MatchString(req.TelefonoContacto) {
			writeError(w, http.StatusBadRequest, "el teléfono no tiene un formato válido")
			return
		}
		if _, err := mail.ParseAddress(req.EmailContacto); err != nil {
			writeError(w, http.StatusBadRequest, "el email no tiene un formato válido")
			return
		}

		turno := db.Turno{
			ProfesionalID:    clinic.ID,
			Estado:           "pendiente",
			NombreContacto:   req.NombreContacto,
			ApellidoContacto: req.ApellidoContacto,
			DNIContacto:      req.DNIContacto,
			TelefonoContacto: req.TelefonoContacto,
			EmailContacto:    req.EmailContacto,
			Motivo:           strings.TrimSpace(req.Motivo),
			Origen:           "pagina_publica",
		}
		if err := gdb.Create(&turno).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo registrar el turno")
			return
		}

		writeJSON(w, http.StatusCreated, solicitarTurnoPublicoResponse{ID: turno.ID.String()})
	}
}
