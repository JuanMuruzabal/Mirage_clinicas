package http

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// La vista del recepcionista — Fase 3.2.6.
//
// El brief: *"Recepcionista: tiene acceso a todas las vistas de los N
// profesionales dentro de la aplicación"*, y el cliente lo precisó al
// arrancar esta subfase: *"el recepcionista puede navegar en todas las
// vistas de los profesionales e interactuar con estas vistas"*.
//
// Lo que NO hace falta, y el cliente lo descartó explícitamente: una
// función propia para pasar pacientes de un profesional a otro (ya está
// "+ Agregar paciente > De la clínica": recepción se para en la vista
// del profesional y lo suma) ni una para marcar la asistencia por
// adelantado (ya está en la tarjeta "Turnos de hoy"). Las dos salen
// gratis de poder pararse en la vista de cada uno — que es justamente
// por qué esta subfase agrega UN endpoint y no un módulo entero.

type elegirVistaRequest struct {
	// UserID del profesional a mirar. Vacío o ausente = volver a la
	// vista general de la clínica.
	UserID string `json:"userId"`
}

type vistaActualResponse struct {
	// Profesional en foco, o null en la vista general.
	Profesional *profesionalDeLaVistaResponse `json:"profesional"`
}

type profesionalDeLaVistaResponse struct {
	UserID string `json:"userId"`
	Nombre string `json:"nombre"`
}

// registrarVistaRecepcionRoutes — solo recepción. El resto de los roles
// no tiene vistas ajenas que mirar: el aislamiento de la 3.2.2 es
// justamente eso.
func registrarVistaRecepcionRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/me/vista", vistaActualHandler(gdb))
	r.Put("/me/vista", elegirVistaHandler(gdb))
}

// vistaActualHandler — GET /me/vista: en qué vista está parada la
// sesión. El frontend lo usa para dibujar el selector del header y para
// decir de quién es la agenda que se está mirando.
func vistaActualHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := profesionalIDFromRequest(w, r); !ok {
			return
		}
		foco := focoDeLaSesion(r)
		if foco == nil {
			writeJSON(w, http.StatusOK, vistaActualResponse{})
			return
		}
		writeJSON(w, http.StatusOK, vistaActualResponse{
			Profesional: &profesionalDeLaVistaResponse{
				UserID: foco.String(),
				Nombre: nombreDelProfesional(gdb, foco),
			},
		})
	}
}

// elegirVistaHandler — PUT /me/vista: pararse en la vista de un
// profesional, o volver a la general.
//
// Vive en la SESIÓN (`sessions.viendo_user_id`), igual que la clínica
// activa de la 3.2.3 y por el mismo motivo: es dónde estoy parado ahora,
// no una preferencia de la cuenta. Ver el comentario del campo en
// models_auth.go para el costo aceptado (dos pestañas comparten el foco).
func elegirVistaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		// SOLO RECEPCIÓN. Un profesional mirando la agenda de un colega
		// es exactamente lo que el brief prohíbe en mayúsculas ("CADA
		// COMPONENTE DEL PANEL DE CADA PROFESIONAL, ES AISLADO DEL RESTO
		// DE PROFESIONALES"), así que esto no puede ser un 404 silencioso
		// ni depender de que el frontend esconda el selector.
		if !tieneAlgunRol(r, db.RoleRecepcion) {
			writeError(w, http.StatusForbidden, "solo recepción puede cambiar de vista")
			return
		}
		session, ok := sessionFromContext(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "sesión inválida")
			return
		}

		var req elegirVistaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.UserID = strings.TrimSpace(req.UserID)

		// Volver a la vista general.
		if req.UserID == "" {
			if err := gdb.Model(&db.Session{}).Where("id = ?", session.ID).
				Update("viendo_user_id", nil).Error; err != nil {
				writeError(w, http.StatusInternalServerError, "no se pudo cambiar de vista")
				return
			}
			writeJSON(w, http.StatusOK, vistaActualResponse{})
			return
		}

		userID, err := uuid.Parse(req.UserID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de profesional inválido")
			return
		}

		// Tiene que ser un PROFESIONAL activo de ESTA clínica. No alcanza
		// con que sea miembro: la vista de un administrador de página o de
		// otro recepcionista no existe — no tienen agenda.
		var miembro db.ClinicMember
		if err := gdb.Preload("Roles").Where("clinic_id = ? AND user_id = ? AND status = ?",
			clinicID, userID, db.ClinicMemberStatusActive).First(&miembro).Error; err != nil {
			writeError(w, http.StatusNotFound, "esa persona no trabaja en esta clínica")
			return
		}
		if !esProfesional(miembro) {
			writeError(w, http.StatusConflict, "esa persona no atiende pacientes en esta clínica")
			return
		}

		if err := gdb.Model(&db.Session{}).Where("id = ?", session.ID).
			Update("viendo_user_id", userID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo cambiar de vista")
			return
		}
		writeJSON(w, http.StatusOK, vistaActualResponse{
			Profesional: &profesionalDeLaVistaResponse{
				UserID: userID.String(),
				Nombre: nombreDelProfesional(gdb, &userID),
			},
		})
	}
}

// esProfesional — si esta membresía atiende pacientes.
func esProfesional(miembro db.ClinicMember) bool {
	for _, rol := range rolesDe(miembro) {
		if rol == db.RoleProfesional {
			return true
		}
	}
	return false
}
