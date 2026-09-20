package http

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// El perfil de un COLEGA (2026-09-19, pedido del cliente: un botón "ver
// perfil" en cada tarjeta de colaborador).
//
// Hasta acá el único perfil visible era el propio (`/me`). El popover de
// colaboradores mostraba nombre, rol y presencia, y no había forma de
// saber nada más de la persona con la que se comparte la clínica — ni
// siquiera su matrícula, que es lo que dice qué puede atender.
//
// QUÉ VIAJA Y QUÉ NO. Lo mismo que el perfil propio, menos el DOCUMENTO:
// el DNI de un colega no hace falta para saber con quién se trabaja, y es
// el único dato de acá que no tiene ningún uso entre colegas. El mail y
// el teléfono sí: el mail ya se ve en la pantalla de Colaboradores, y el
// teléfono es lo que se usa para coordinar un cambio de turno.
type perfilDeColegaResponse struct {
	UserID string `json:"userId"`
	// Nombre con el mismo criterio que /equipo: el del perfil si lo
	// completó, el mail si todavía no.
	Nombre string `json:"nombre"`
	Email  string `json:"email"`
	// Roles en ESTA clínica, no en general: la misma persona puede ser
	// profesional acá y recepción en otra.
	Roles     []string        `json:"roles"`
	EsTitular bool            `json:"esTitular"`
	EsVos     bool            `json:"esVos"`
	Perfil    *perfilResponse `json:"perfil,omitempty"`
}

// perfilDeColegaHandler — GET /equipo/miembros/{userId}/perfil.
//
// Acotado a miembros ACTIVOS de la clínica de quien pregunta. No alcanza
// con tener el id: un uuid de otra clínica responde 404, igual que la
// ficha de un paciente ajeno (TR-138) y por el mismo motivo — que una
// persona exista no es información que este profesional deba tener.
func perfilDeColegaHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clinicID, ok := profesionalIDFromRequest(w, r)
		if !ok {
			return
		}
		userID, err := uuid.Parse(chi.URLParam(r, "userId"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "id de colaborador inválido")
			return
		}

		// Preload de los roles: viven en `clinic_member_roles`, no en una
		// columna, así que sin esto `rolesDe` devuelve una lista vacía y
		// la pantalla no puede decir qué hace esa persona en la clínica.
		var miembro db.ClinicMember
		if err := gdb.Preload("Roles").Where("clinic_id = ? AND user_id = ? AND status = ?",
			clinicID, userID, db.ClinicMemberStatusActive).First(&miembro).Error; err != nil {
			writeError(w, http.StatusNotFound, "esa persona no trabaja en esta clínica")
			return
		}

		var user db.User
		if err := gdb.First(&user, "id = ?", userID).Error; err != nil {
			writeError(w, http.StatusNotFound, "esa persona no trabaja en esta clínica")
			return
		}

		var clinic db.Clinic
		if err := gdb.First(&clinic, "id = ?", clinicID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo obtener el perfil")
			return
		}

		yo, _ := usuarioDeLaSesion(r)
		out := perfilDeColegaResponse{
			UserID:    userID.String(),
			Nombre:    user.Email,
			Email:     user.Email,
			Roles:     rolesDe(miembro),
			EsTitular: clinic.OwnerID == userID,
			EsVos:     yo == userID,
		}

		// Sin perfil cargado no es un error: alguien invitado que todavía
		// no lo completó existe igual, y la pantalla lo dice.
		var perfil db.ProfessionalProfile
		if err := gdb.Preload("Especialidades").First(&perfil, "user_id = ?", userID).Error; err == nil {
			p := toPerfilResponse(perfil)
			// El documento no sale de su dueño: ver el comentario de
			// arriba.
			p.Documento = nil
			out.Perfil = &p
			if n := strings.TrimSpace(p.Nombre + " " + p.Apellido); n != "" {
				out.Nombre = n
			}
		}

		writeJSON(w, http.StatusOK, out)
	}
}
