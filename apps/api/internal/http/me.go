package http

import (
	"net/http"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"dental-mirage/api/internal/db"
)

// meResponse combina User + ProfessionalProfile + Clinic — reemplaza al
// viejo profesionalResponse (que era una sola fila Profesional). Perfil y
// Clinica son nil mientras el onboarding no llegó a esos pasos: el
// frontend (lib/session.ts) usa justamente eso para saber a qué paso
// del wizard redirigir.
type meResponse struct {
	ID                   string             `json:"id"`
	Email                string             `json:"email"`
	EmailVerificado      bool               `json:"emailVerificado"`
	OnboardingStep       string             `json:"onboardingStep"`
	OnboardingCompletado bool               `json:"onboardingCompletado"`
	Perfil               *perfilResponse    `json:"perfil,omitempty"`
	Clinica              *clinicaMeResponse `json:"clinica,omitempty"`
}

type clinicaMeResponse struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
	Slug   string `json:"slug"`
	Tipo   string `json:"tipo"`
	Rol    string `json:"rol"`
}

func meHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromRequest(w, r)
		if !ok {
			return
		}

		var user db.User
		if err := gdb.First(&user, "id = ?", userID).Error; err != nil {
			writeError(w, http.StatusNotFound, "usuario no encontrado")
			return
		}

		resp := meResponse{
			ID: user.ID.String(), Email: user.Email,
			EmailVerificado:      user.EmailVerifiedAt != nil,
			OnboardingStep:       user.OnboardingStep,
			OnboardingCompletado: user.OnboardingStep == db.OnboardingStepCompleto,
		}

		var profile db.ProfessionalProfile
		if err := gdb.Preload("Especialidades").First(&profile, "user_id = ?", userID).Error; err == nil {
			perfil := toPerfilResponse(profile)
			resp.Perfil = &perfil
		}

		var member db.ClinicMember
		if err := gdb.Where("user_id = ? AND role = ?", userID, db.RoleOwner).First(&member).Error; err == nil {
			var clinic db.Clinic
			if err := gdb.First(&clinic, "id = ?", member.ClinicID).Error; err == nil {
				resp.Clinica = &clinicaMeResponse{
					ID: clinic.ID.String(), Nombre: clinic.Nombre, Slug: clinic.Slug,
					Tipo: clinic.Tipo, Rol: member.Role,
				}
			}
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

// updateMeRequest — edición del perfil ya completo desde /perfil (no el
// wizard de onboarding, que usa /onboarding/perfil). Mismos campos, misma
// validación de fondo; la única diferencia real es que este handler no
// avanza OnboardingStep.
type updateMeRequest = onboardingPerfilRequest

func updateMeHandler(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromRequest(w, r)
		if !ok {
			return
		}

		var existing db.ProfessionalProfile
		if err := gdb.First(&existing, "user_id = ?", userID).Error; err != nil {
			writeError(w, http.StatusNotFound, "todavía no completaste tu perfil profesional")
			return
		}

		var req updateMeRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		nombre := strings.TrimSpace(req.Nombre)
		apellido := strings.TrimSpace(req.Apellido)
		telefono := strings.TrimSpace(req.Telefono)
		if nombre == "" || apellido == "" || telefono == "" {
			writeError(w, http.StatusBadRequest, "nombre, apellido y teléfono son obligatorios")
			return
		}

		especialidades, err := loadEspecialidades(gdb, req.EspecialidadIDs)
		if err != nil {
			writeError(w, http.StatusBadRequest, "una de las especialidades elegidas no es válida")
			return
		}

		prefijo := strings.TrimSpace(req.TelefonoPrefijo)
		if prefijo == "" {
			prefijo = existing.TelefonoPrefijo
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			updates := db.ProfessionalProfile{
				Nombre: nombre, Apellido: apellido, TelefonoPrefijo: prefijo, Telefono: telefono,
				Documento: req.Documento, AniosExperiencia: req.AniosExperiencia, Bio: req.Bio, Idiomas: req.Idiomas,
			}
			if req.MatriculaTipo != "" {
				updates.MatriculaTipo = req.MatriculaTipo
			} else {
				updates.MatriculaTipo = existing.MatriculaTipo
			}
			if req.MatriculaNumero != "" {
				updates.MatriculaNumero = req.MatriculaNumero
			} else {
				updates.MatriculaNumero = existing.MatriculaNumero
			}
			if err := tx.Model(&existing).Select(
				"Nombre", "Apellido", "TelefonoPrefijo", "Telefono", "Documento",
				"MatriculaTipo", "MatriculaNumero", "AniosExperiencia", "Bio", "Idiomas",
			).Clauses(clause.Returning{}).Updates(updates).Error; err != nil {
				return err
			}
			return tx.Model(&existing).Association("Especialidades").Replace(&especialidades)
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo actualizar el perfil")
			return
		}

		if err := gdb.Preload("Especialidades").First(&existing, "user_id = ?", userID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "perfil actualizado pero no se pudo leerlo de vuelta")
			return
		}
		writeJSON(w, http.StatusOK, toPerfilResponse(existing))
	}
}
