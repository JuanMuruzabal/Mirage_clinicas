package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// "¿Dónde trabajás hoy?" — Fase 3.2.3.
//
// Es el punto de partida de toda sesión: el brief lo pide explícito
// ("siempre será el inicio de partida"). Las tres cosas que necesita esa
// pantalla viven acá: qué clínicas tiene la persona, cuál elige para esta
// sesión, y el código con el que se ofrece para que la sumen a otra.
//
// Va en el grupo que solo exige SESIÓN, nunca detrás de `requireClinic`:
// la pantalla existe justamente para los casos en que todavía no hay
// ninguna clínica, o en que hay varias y ninguna elegida.

func registerMisClinicasRoutes(r chi.Router, gdb *gorm.DB) {
	r.Get("/me/clinicas", misClinicasHandler(gdb))
	r.Put("/me/clinica-activa", elegirClinicaActivaHandler(gdb))
	r.Post("/me/codigo-invitacion", generarCodigoInvitacionHandler(gdb))
}

type clinicaDelUsuarioResponse struct {
	ID        string   `json:"id"`
	Nombre    string   `json:"nombre"`
	Slug      string   `json:"slug"`
	Tipo      string   `json:"tipo"`
	Direccion *string  `json:"direccion,omitempty"`
	Ciudad    *string  `json:"ciudad,omitempty"`
	Provincia *string  `json:"provincia,omitempty"`
	Roles     []string `json:"roles"`
	// RolPrincipal es el de mayor alcance, para mostrarlo como etiqueta
	// única en la tarjeta (el mockup muestra una sola: "Titular").
	RolPrincipal string `json:"rolPrincipal"`
	// EsPropia — la clínica que esta persona creó. El mockup la separa del
	// resto ("Mi clínica" arriba, "Otras clínicas" abajo).
	EsPropia bool `json:"esPropia"`
	// Profesionales — cuántos atienden en esa clínica, como dice el
	// mockup ("3 profesionales"). Se cuentan los miembros ACTIVOS con rol
	// profesional, no todos los miembros: un recepcionista no atiende.
	Profesionales int  `json:"profesionales"`
	Activa        bool `json:"activa"`
}

type codigoInvitacionResponse struct {
	Codigo  string    `json:"codigo"`
	VenceAt time.Time `json:"venceAt"`
}

type misClinicasResponse struct {
	Clinicas []clinicaDelUsuarioResponse `json:"clinicas"`
	// CodigoInvitacion es nil si nunca generó uno o si el que tenía ya
	// venció — un código vencido no se muestra, porque mostrarlo invita a
	// compartir algo que no va a funcionar.
	CodigoInvitacion *codigoInvitacionResponse `json:"codigoInvitacion,omitempty"`
}

func misClinicasHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, ok := sessionFromContext(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}

		var miembros []db.ClinicMember
		if err := gdb.Preload("Roles").
			Where("user_id = ? AND status = ?", session.UserID, db.ClinicMemberStatusActive).
			Order("created_at").Find(&miembros).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudieron leer tus clínicas")
			return
		}

		resp := misClinicasResponse{Clinicas: []clinicaDelUsuarioResponse{}}
		for _, miembro := range miembros {
			var clinica db.Clinic
			if err := gdb.First(&clinica, "id = ?", miembro.ClinicID).Error; err != nil {
				continue
			}
			var profesionales int64
			gdb.Model(&db.ClinicMember{}).Scopes(db.ConRol(db.RoleProfesional)).
				Where("clinic_members.clinic_id = ? AND clinic_members.status = ?", clinica.ID, db.ClinicMemberStatusActive).
				Count(&profesionales)

			resp.Clinicas = append(resp.Clinicas, clinicaDelUsuarioResponse{
				ID: clinica.ID.String(), Nombre: clinica.Nombre, Slug: clinica.Slug, Tipo: clinica.Tipo,
				Direccion: clinica.Direccion, Ciudad: clinica.Ciudad, Provincia: clinica.Provincia,
				Roles:         rolesDe(miembro),
				RolPrincipal:  db.RolPrincipal(miembro.Roles),
				EsPropia:      clinica.OwnerID == session.UserID,
				Profesionales: int(profesionales),
				Activa:        session.ClinicID != nil && *session.ClinicID == clinica.ID,
			})
		}

		var user db.User
		if err := gdb.First(&user, "id = ?", session.UserID).Error; err == nil {
			if user.CodigoInvitacion != nil && user.CodigoInvitacionExpiraAt != nil &&
				time.Now().Before(*user.CodigoInvitacionExpiraAt) {
				resp.CodigoInvitacion = &codigoInvitacionResponse{
					Codigo: *user.CodigoInvitacion, VenceAt: *user.CodigoInvitacionExpiraAt,
				}
			}
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

type elegirClinicaActivaRequest struct {
	ClinicaID string `json:"clinicaId"`
}

// elegirClinicaActivaHandler guarda en la SESIÓN la clínica elegida.
//
// Valida la membresía acá aunque `requireClinic` la revalide en cada
// request: sin esto, la sesión quedaría guardando el ID de una clínica
// ajena y el error recién aparecería en la pantalla siguiente, como un
// "completá el alta de tu clínica" que no tiene nada que ver con lo que
// la persona hizo.
func elegirClinicaActivaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		session, ok := sessionFromContext(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
			return
		}

		var req elegirClinicaActivaRequest
		if err := decodeJSON(w, r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		clinicaID, err := uuid.Parse(req.ClinicaID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "el identificador de la clínica no es válido")
			return
		}

		var miembro db.ClinicMember
		if err := gdb.Where("user_id = ? AND clinic_id = ? AND status = ?",
			session.UserID, clinicaID, db.ClinicMemberStatusActive).First(&miembro).Error; err != nil {
			// 404 y no 403: que esa clínica exista no es información que le
			// corresponda a quien no trabaja en ella. Mismo criterio que la
			// ficha de un paciente ajeno (Fase 3.2.2, TR-138).
			writeError(w, http.StatusNotFound, "no trabajás en esa clínica")
			return
		}

		if err := gdb.Model(&db.Session{}).Where("id = ?", session.ID).
			Update("clinic_id", clinicaID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo cambiar de clínica")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"clinicaId": clinicaID.String()})
	}
}

func generarCodigoInvitacionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromRequest(w, r)
		if !ok {
			return
		}
		codigo, vence, err := db.GenerarCodigoInvitacion(gdb, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el código")
			return
		}
		writeJSON(w, http.StatusOK, codigoInvitacionResponse{Codigo: codigo, VenceAt: vence})
	}
}
