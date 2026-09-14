package http

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Aceptar o rechazar una invitación — Fase 3.2.4, el lado del invitado.
//
// Vive en el grupo que solo exige SESIÓN (no `requireClinic`): quien
// acepta puede no tener ninguna clínica todavía, que es justamente el
// caso de alguien que entró a la app porque lo invitaron.

// invitacionParaMi resuelve el {id} de la ruta y verifica que la
// invitación sea REALMENTE para el mail de quien la está respondiendo.
//
// Es la verificación que importa de todo este archivo: el id de una
// invitación no es secreto —viaja en la pantalla de quien invitó— así que
// sin este chequeo cualquiera con sesión podría aceptar la invitación de
// otro y meterse en una clínica ajena. Una invitación que no es mía
// responde 404 y no 403: que exista no es información que me corresponda.
func invitacionParaMi(w http.ResponseWriter, r *http.Request, gdb *gorm.DB) (db.ClinicInvitation, db.User, bool) {
	session, ok := sessionFromContext(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "falta el token de autenticación")
		return db.ClinicInvitation{}, db.User{}, false
	}
	var user db.User
	if err := gdb.First(&user, "id = ?", session.UserID).Error; err != nil {
		writeError(w, http.StatusNotFound, "usuario no encontrado")
		return db.ClinicInvitation{}, db.User{}, false
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusNotFound, "invitación no encontrada")
		return db.ClinicInvitation{}, db.User{}, false
	}
	var invitacion db.ClinicInvitation
	if err := gdb.Where("id = ? AND email = ? AND accepted_at IS NULL AND expires_at > ?",
		id, user.Email, time.Now()).First(&invitacion).Error; err != nil {
		writeError(w, http.StatusNotFound, "invitación no encontrada")
		return db.ClinicInvitation{}, db.User{}, false
	}
	return invitacion, user, true
}

func aceptarInvitacionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		invitacion, user, ok := invitacionParaMi(w, r, gdb)
		if !ok {
			return
		}

		// El perfil profesional es condición para entrar a cualquier
		// clínica: sin nombre no hay nada que mostrarle al equipo. Para
		// aceptar una invitación DE PROFESIONAL hace falta además la
		// matrícula, igual que para crear la clínica propia o entrar a
		// atender (Fase 3.2.3) — el frontend la pide antes de llegar acá.
		var perfil db.ProfessionalProfile
		if err := gdb.First(&perfil, "user_id = ?", user.ID).Error; err != nil {
			writeError(w, http.StatusForbidden, "completá tu perfil antes de sumarte a una clínica")
			return
		}
		if invitacion.Role == db.RoleProfesional && perfil.TipoPerfil != db.PerfilTipoProfesional {
			writeError(w, http.StatusForbidden, "completá tus datos profesionales para sumarte como profesional")
			return
		}

		ahora := time.Now()
		err := gdb.Transaction(func(tx *gorm.DB) error {
			// Reingreso: si la persona ya estuvo en esta clínica y la
			// sacaron, la membresía sigue ahí marcada `removed` (TR-137,
			// nunca se borra). Se reactiva en vez de crear una segunda,
			// que el índice único (clinic_id, user_id) rechazaría — y con
			// razón: es la misma relación, no una nueva.
			var miembro db.ClinicMember
			if err := tx.Where("clinic_id = ? AND user_id = ?", invitacion.ClinicID, user.ID).
				First(&miembro).Error; err == nil {
				if err := tx.Model(&miembro).Updates(map[string]any{
					"status": db.ClinicMemberStatusActive, "joined_at": ahora,
				}).Error; err != nil {
					return err
				}
			} else {
				miembro = db.ClinicMember{
					ClinicID: invitacion.ClinicID, UserID: user.ID,
					Status: db.ClinicMemberStatusActive, JoinedAt: &ahora,
				}
				if err := tx.Create(&miembro).Error; err != nil {
					return err
				}
			}

			if err := db.AsignarRol(tx, miembro.ID, invitacion.Role); err != nil {
				return err
			}
			return tx.Model(&invitacion).Update("accepted_at", ahora).Error
		})
		if err != nil {
			// El índice único parcial de roles excluyentes (TR-137) es el
			// que puede rechazar acá: alguien que ya era `recepcion` en
			// esta clínica no puede además ser `profesional`. El motor lo
			// impide; acá se traduce a algo que se entienda.
			if isUniqueViolation(err) {
				writeError(w, http.StatusConflict, "no podés ser profesional y recepción en la misma clínica")
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo aceptar la invitación")
			return
		}

		recordAuditEvent(gdb, &user.ID, db.AuditEventColaboradorAceptado, clientIP(r), r.UserAgent())
		writeJSON(w, http.StatusOK, map[string]string{"clinicaId": invitacion.ClinicID.String()})
	}
}

func rechazarInvitacionHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		invitacion, _, ok := invitacionParaMi(w, r, gdb)
		if !ok {
			return
		}
		// Se borra, igual que al cancelarla desde la clínica: una
		// invitación sin aceptar no es historia de nada. Y borrarla libera
		// el "ya tiene una invitación pendiente", así que la clínica puede
		// volver a invitar si fue un malentendido.
		if err := gdb.Delete(&invitacion).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo rechazar la invitación")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
