package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"dental-mirage/api/internal/db"
	dmmail "dental-mirage/api/internal/mail"
)

// registerOnboardingRoutes monta /onboarding/perfil (Paso 2) y
// /onboarding/clinica (Paso 3) — spec §4. Ambos requieren sesión pero NO
// una Clinic todavía (por diseño, no existe hasta que el Paso 3 termina) —
// por eso van en el grupo de requireSession, nunca en el de requireClinic.
func registerOnboardingRoutes(r chi.Router, gdb *gorm.DB, sender dmmail.Sender) {
	r.Patch("/onboarding/perfil", updateOnboardingPerfilHandler(gdb))
	r.Patch("/onboarding/clinica", updateOnboardingClinicaHandler(gdb, sender))
}

// ---------------------------------------------------------------------
// Paso 2 — Perfil profesional
// ---------------------------------------------------------------------

type onboardingPerfilRequest struct {
	Nombre           string   `json:"nombre"`
	Apellido         string   `json:"apellido"`
	TelefonoPrefijo  string   `json:"telefonoPrefijo"`
	Telefono         string   `json:"telefono"`
	Documento        *string  `json:"documento,omitempty"`
	MatriculaTipo    string   `json:"matriculaTipo"`
	MatriculaNumero  string   `json:"matriculaNumero"`
	EspecialidadIDs  []string `json:"especialidadIds"`
	AniosExperiencia *int     `json:"aniosExperiencia,omitempty"`
	Bio              *string  `json:"bio,omitempty"`
	Idiomas          []string `json:"idiomas,omitempty"`
}

type perfilResponse struct {
	Nombre           string                 `json:"nombre"`
	Apellido         string                 `json:"apellido"`
	TelefonoPrefijo  string                 `json:"telefonoPrefijo"`
	Telefono         string                 `json:"telefono"`
	Documento        *string                `json:"documento,omitempty"`
	MatriculaTipo    string                 `json:"matriculaTipo"`
	MatriculaNumero  string                 `json:"matriculaNumero"`
	Especialidades   []especialidadResponse `json:"especialidades"`
	AniosExperiencia *int                   `json:"aniosExperiencia,omitempty"`
	Bio              *string                `json:"bio,omitempty"`
	Idiomas          []string               `json:"idiomas,omitempty"`
}

func toPerfilResponse(p db.ProfessionalProfile) perfilResponse {
	especialidades := make([]especialidadResponse, len(p.Especialidades))
	for i, e := range p.Especialidades {
		especialidades[i] = toEspecialidadResponse(e)
	}
	return perfilResponse{
		Nombre: p.Nombre, Apellido: p.Apellido,
		TelefonoPrefijo: p.TelefonoPrefijo, Telefono: p.Telefono,
		Documento: p.Documento, MatriculaTipo: p.MatriculaTipo, MatriculaNumero: p.MatriculaNumero,
		Especialidades: especialidades, AniosExperiencia: p.AniosExperiencia, Bio: p.Bio, Idiomas: p.Idiomas,
	}
}

// updateOnboardingPerfilHandler crea o actualiza el ProfessionalProfile
// del usuario autenticado (Paso 2) — obligatorios: nombre, apellido,
// teléfono, matrícula, al menos una especialidad (spec §4).
func updateOnboardingPerfilHandler(gdb *gorm.DB) http.HandlerFunc {
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
		if user.EmailVerifiedAt == nil {
			writeError(w, http.StatusForbidden, "confirmá tu mail antes de completar tu perfil")
			return
		}
		if user.OnboardingStep == db.OnboardingStepCompleto {
			writeError(w, http.StatusForbidden, "el onboarding ya está completo")
			return
		}

		var req onboardingPerfilRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.Nombre = strings.TrimSpace(req.Nombre)
		req.Apellido = strings.TrimSpace(req.Apellido)
		req.Telefono = strings.TrimSpace(req.Telefono)
		req.MatriculaNumero = strings.TrimSpace(req.MatriculaNumero)

		if req.Nombre == "" || req.Apellido == "" || req.Telefono == "" {
			writeError(w, http.StatusBadRequest, "nombre, apellido y teléfono son obligatorios")
			return
		}
		if req.MatriculaTipo != db.MatriculaTipoNacional && req.MatriculaTipo != db.MatriculaTipoProvincial {
			writeError(w, http.StatusBadRequest, "elegí el tipo de matrícula")
			return
		}
		if req.MatriculaNumero == "" {
			writeError(w, http.StatusBadRequest, "la matrícula es obligatoria")
			return
		}
		if len(req.EspecialidadIDs) == 0 {
			writeError(w, http.StatusBadRequest, "elegí al menos una especialidad")
			return
		}
		especialidades, err := loadEspecialidades(gdb, req.EspecialidadIDs)
		if err != nil {
			writeError(w, http.StatusBadRequest, "una de las especialidades elegidas no es válida")
			return
		}

		prefijo := strings.TrimSpace(req.TelefonoPrefijo)
		if prefijo == "" {
			prefijo = "+54"
		}

		profile := db.ProfessionalProfile{
			UserID: userID, Nombre: req.Nombre, Apellido: req.Apellido,
			TelefonoPrefijo: prefijo, Telefono: req.Telefono, Documento: req.Documento,
			MatriculaTipo: req.MatriculaTipo, MatriculaNumero: req.MatriculaNumero,
			AniosExperiencia: req.AniosExperiencia, Bio: req.Bio, Idiomas: req.Idiomas,
		}

		err = gdb.Transaction(func(tx *gorm.DB) error {
			// Idempotente: si el usuario vuelve atrás y edita el paso 2, se
			// actualiza la fila existente (PK = user_id) en vez de fallar
			// por unique violation.
			if err := tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "user_id"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"nombre", "apellido", "telefono_prefijo", "telefono", "documento",
					"matricula_tipo", "matricula_numero", "anios_experiencia", "bio", "idiomas", "updated_at",
				}),
			}).Create(&profile).Error; err != nil {
				return err
			}
			if err := tx.Model(&profile).Association("Especialidades").Replace(&especialidades); err != nil {
				return err
			}
			if user.OnboardingStep == db.OnboardingStepPerfil {
				return tx.Model(&user).Update("onboarding_step", db.OnboardingStepClinica).Error
			}
			return nil
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo guardar tu perfil")
			return
		}

		if err := gdb.Preload("Especialidades").First(&profile, "user_id = ?", userID).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "perfil guardado pero no se pudo leerlo de vuelta")
			return
		}
		writeJSON(w, http.StatusOK, toPerfilResponse(profile))
	}
}

// ---------------------------------------------------------------------
// Paso 3 — Tu clínica
// ---------------------------------------------------------------------

type onboardingClinicaRequest struct {
	Tipo      string  `json:"tipo"`
	Nombre    string  `json:"nombre"`
	Direccion *string `json:"direccion,omitempty"`
	Ciudad    *string `json:"ciudad,omitempty"`
	Provincia *string `json:"provincia,omitempty"`
	Telefono  *string `json:"telefono,omitempty"`
}

type onboardingClinicaResponse struct {
	ClinicID       string `json:"clinicId"`
	Slug           string `json:"slug"`
	OnboardingStep string `json:"onboardingStep"`
}

// updateOnboardingClinicaHandler crea la Clinic del usuario y su
// ClinicMember{Role:"owner"} (Paso 3) — completa el onboarding. Rechaza si
// ya está completo (spec §4: "onboarding completo → no puede volver al
// wizard").
func updateOnboardingClinicaHandler(gdb *gorm.DB, sender dmmail.Sender) http.HandlerFunc {
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
		if user.OnboardingStep == db.OnboardingStepCompleto {
			writeError(w, http.StatusForbidden, "el onboarding ya está completo")
			return
		}
		if user.OnboardingStep != db.OnboardingStepClinica {
			writeError(w, http.StatusForbidden, "completá tu perfil profesional antes de este paso")
			return
		}

		var req onboardingClinicaRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "cuerpo de la request inválido")
			return
		}
		req.Nombre = strings.TrimSpace(req.Nombre)
		if req.Tipo != db.ClinicTipoIndividual && req.Tipo != db.ClinicTipoOrganizacion {
			writeError(w, http.StatusBadRequest, "elegí el tipo de clínica")
			return
		}
		if req.Nombre == "" {
			writeError(w, http.StatusBadRequest, "el nombre de la clínica es obligatorio")
			return
		}

		slug, err := uniqueSlug(gdb, req.Nombre)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "no se pudo generar el identificador de la clínica")
			return
		}

		clinic := db.Clinic{
			Nombre: req.Nombre, Tipo: req.Tipo, Slug: slug,
			Direccion: req.Direccion, Ciudad: req.Ciudad, Provincia: req.Provincia, Telefono: req.Telefono,
			OwnerID: userID,
		}
		now := time.Now()

		err = gdb.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&clinic).Error; err != nil {
				return err
			}
			member := db.ClinicMember{
				ClinicID: clinic.ID, UserID: userID, Role: db.RoleOwner, Status: db.ClinicMemberStatusActive, JoinedAt: &now,
			}
			if err := tx.Create(&member).Error; err != nil {
				return err
			}
			if err := db.SeedTiposConsultaDefault(tx, clinic.ID); err != nil {
				return err
			}
			return tx.Model(&user).Updates(map[string]any{
				"onboarding_step":         db.OnboardingStepCompleto,
				"onboarding_completed_at": now,
			}).Error
		})
		if err != nil {
			if isUniqueViolation(err) {
				writeError(w, http.StatusConflict, "ya existe una clínica con ese nombre")
				return
			}
			writeError(w, http.StatusInternalServerError, "no se pudo crear la clínica")
			return
		}

		if sender != nil {
			var profile db.ProfessionalProfile
			nombre := ""
			if err := gdb.First(&profile, "user_id = ?", userID).Error; err == nil {
				nombre = profile.Nombre
			}
			_ = sender.SendWelcomeEmail(r.Context(), user.Email, nombre)
		}

		writeJSON(w, http.StatusOK, onboardingClinicaResponse{
			ClinicID: clinic.ID.String(), Slug: clinic.Slug, OnboardingStep: db.OnboardingStepCompleto,
		})
	}
}
