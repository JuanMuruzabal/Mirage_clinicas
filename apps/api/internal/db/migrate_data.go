package db

import (
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// MigrateProfesionalesToUsers traslada cada Profesional existente (esquema
// viejo) a User + ProfessionalProfile + Clinic + ClinicMember (esquema
// nuevo, docs/feature-sumarte-login.md) — corrida de una sola vez, invocada
// explícitamente desde cmd/migrate-usuarios, NO desde RunMigrations. Es
// idempotente por email: si ya existe un User con el mismo email, esa fila
// se saltea (permite reintentar tras un corte a mitad de camino sin
// duplicar).
//
// Decisiones de la migración (plan aprobado):
//   - EmailVerifiedAt se fija a "ahora": ya estaban confiados, no se les
//     vuelve a pedir verificación.
//   - PasswordHash se copia tal cual (bcrypt) — internal/security.Verify
//     reconoce el prefijo y sigue validando sin forzar un rehash inmediato.
//   - OnboardingStep queda "completo": no se los manda al wizard de alta.
//   - Clinic.ID = Profesional.ID (mismo UUID) — así turnos/pacientes/
//     tipos_consulta/paginas_publicas (que solo tienen un ProfesionalID
//     suelto, sin asociación GORM, o sea sin FK real que repuntar) siguen
//     resolviendo exactamente igual sin tocar una sola fila de esas tablas.
//   - Campos nuevos que no existían (MatriculaTipo/Numero, Apellido si no
//     separable, TermsAcceptedAt, dirección de la Clinic) quedan vacíos —
//     el guard de /panel no los bloquea, pero /perfil los invita a
//     completarlos (ver docs/tradeoffs.md).
func MigrateProfesionalesToUsers(gdb *gorm.DB) (migrated int, skipped int, err error) {
	var profesionales []Profesional
	if err := gdb.Preload("Especialidades").Find(&profesionales).Error; err != nil {
		return 0, 0, fmt.Errorf("no se pudieron leer los profesionales existentes: %w", err)
	}

	for _, p := range profesionales {
		var count int64
		if err := gdb.Model(&User{}).Where("email = ?", p.Email).Count(&count).Error; err != nil {
			return migrated, skipped, fmt.Errorf("no se pudo chequear si %s ya está migrado: %w", p.Email, err)
		}
		if count > 0 {
			skipped++
			continue
		}

		if err := migrateOneProfesional(gdb, p); err != nil {
			return migrated, skipped, fmt.Errorf("no se pudo migrar a %s: %w", p.Email, err)
		}
		migrated++
	}

	return migrated, skipped, nil
}

func migrateOneProfesional(gdb *gorm.DB, p Profesional) error {
	now := time.Now()
	nombre, apellido := splitNombreApellido(p.Nombre)
	passwordHash := p.PasswordHash

	return gdb.Transaction(func(tx *gorm.DB) error {
		user := User{
			ID:                    p.ID, // mismo UUID que el Profesional de origen — no hace falta para User en sí, pero simplifica trazabilidad al auditar la migración
			Email:                 p.Email,
			EmailVerifiedAt:       &now,
			PasswordHash:          &passwordHash,
			OnboardingStep:        OnboardingStepCompleto,
			OnboardingCompletedAt: &now,
			CreatedAt:             p.CreatedAt,
		}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}

		profile := ProfessionalProfile{
			UserID:          user.ID,
			Nombre:          nombre,
			Apellido:        apellido,
			TelefonoPrefijo: "+54",
			Telefono:        derefOrEmpty(p.Telefono),
		}
		if err := tx.Create(&profile).Error; err != nil {
			return err
		}
		if len(p.Especialidades) > 0 {
			if err := tx.Model(&profile).Association("Especialidades").Append(&p.Especialidades); err != nil {
				return err
			}
		}

		clinic := Clinic{
			ID:        p.ID,
			Nombre:    p.NombreClinica,
			Tipo:      ClinicTipoIndividual,
			Slug:      p.Slug,
			OwnerID:   user.ID,
			CreatedAt: p.CreatedAt,
		}
		if err := tx.Create(&clinic).Error; err != nil {
			return err
		}

		member := ClinicMember{
			ClinicID: clinic.ID,
			UserID:   user.ID,
			Role:     RoleOwner,
			Status:   ClinicMemberStatusActive,
			JoinedAt: &now,
		}
		return tx.Create(&member).Error
	})
}

// splitNombreApellido separa el primer token de Profesional.Nombre como
// nombre y el resto como apellido — heurística frágil si el nombre
// original era una sola palabra (apellido queda vacío, a completar en
// /perfil), pero es lo mejor posible sin pedirle el dato al usuario.
func splitNombreApellido(nombreCompleto string) (nombre, apellido string) {
	partes := strings.Fields(nombreCompleto)
	if len(partes) == 0 {
		return "", ""
	}
	if len(partes) == 1 {
		return partes[0], ""
	}
	return partes[0], strings.Join(partes[1:], " ")
}

func derefOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
