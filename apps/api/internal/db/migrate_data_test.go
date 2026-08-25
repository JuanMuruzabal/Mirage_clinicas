package db_test

import (
	"testing"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// TestMigrateProfesionalesToUsers_MigraSinPerdidaDeDatos cubre el punto de
// aceptación "la especialidad única existente quedó migrada a la relación
// múltiple sin pérdida de datos" (docs/feature-sumarte-login.md §10) y la
// estrategia de migración del plan aprobado: un Profesional produce
// User+ProfessionalProfile+Clinic+ClinicMember con el mismo UUID de Clinic
// que tenía el Profesional, sin perder especialidades ni contraseña.
func TestMigrateProfesionalesToUsers_MigraSinPerdidaDeDatos(t *testing.T) {
	gdb := testdb.New(t)

	especialidad := db.Especialidad{Nombre: "Especialidad de prueba " + uuid.NewString()}
	if err := gdb.Create(&especialidad).Error; err != nil {
		t.Fatalf("no se pudo crear la especialidad de prueba: %v", err)
	}

	telefono := "+5493511234567"
	profesional := db.Profesional{
		Nombre:        "Ana María Pérez",
		Email:         uuid.NewString() + "@example.com",
		PasswordHash:  "hash-bcrypt-de-prueba",
		Telefono:      &telefono,
		NombreClinica: "Clínica Sonrisas",
		Slug:          "clinica-sonrisas-" + uuid.NewString(),
	}
	if err := gdb.Create(&profesional).Error; err != nil {
		t.Fatalf("no se pudo crear el profesional de prueba: %v", err)
	}
	if err := gdb.Model(&profesional).Association("Especialidades").Append(&especialidad); err != nil {
		t.Fatalf("no se pudo asociar la especialidad: %v", err)
	}

	migrated, skipped, err := db.MigrateProfesionalesToUsers(gdb)
	if err != nil {
		t.Fatalf("MigrateProfesionalesToUsers error inesperado: %v", err)
	}
	if migrated < 1 {
		t.Fatalf("migrated = %d, esperaba al menos 1", migrated)
	}
	if skipped != 0 {
		t.Fatalf("skipped = %d, esperaba 0 en la primera corrida", skipped)
	}

	var user db.User
	if err := gdb.Where("email = ?", profesional.Email).First(&user).Error; err != nil {
		t.Fatalf("no se encontró el User migrado: %v", err)
	}
	if user.EmailVerifiedAt == nil {
		t.Error("EmailVerifiedAt debería quedar seteado (usuario ya confiado, no se le vuelve a pedir verificación)")
	}
	if user.PasswordHash == nil || *user.PasswordHash != profesional.PasswordHash {
		t.Error("PasswordHash debería copiarse tal cual, sin rehash")
	}
	if user.OnboardingStep != db.OnboardingStepCompleto {
		t.Errorf("OnboardingStep = %q, esperaba %q", user.OnboardingStep, db.OnboardingStepCompleto)
	}

	var profile db.ProfessionalProfile
	if err := gdb.Preload("Especialidades").First(&profile, "user_id = ?", user.ID).Error; err != nil {
		t.Fatalf("no se encontró el ProfessionalProfile migrado: %v", err)
	}
	if profile.Nombre != "Ana" || profile.Apellido != "María Pérez" {
		t.Errorf("Nombre/Apellido = %q/%q, esperaba \"Ana\"/\"María Pérez\"", profile.Nombre, profile.Apellido)
	}
	if profile.Telefono != telefono {
		t.Errorf("Telefono = %q, esperaba %q", profile.Telefono, telefono)
	}
	if len(profile.Especialidades) != 1 || profile.Especialidades[0].ID != especialidad.ID {
		t.Errorf("Especialidades = %+v, esperaba solo %v", profile.Especialidades, especialidad.ID)
	}

	var clinic db.Clinic
	if err := gdb.First(&clinic, "id = ?", profesional.ID).Error; err != nil {
		t.Fatalf("la Clinic debería nacer con el mismo UUID que el Profesional: %v", err)
	}
	if clinic.Tipo != db.ClinicTipoIndividual {
		t.Errorf("Clinic.Tipo = %q, esperaba %q", clinic.Tipo, db.ClinicTipoIndividual)
	}
	if clinic.Nombre != profesional.NombreClinica || clinic.Slug != profesional.Slug {
		t.Errorf("Clinic.Nombre/Slug = %q/%q, esperaba %q/%q", clinic.Nombre, clinic.Slug, profesional.NombreClinica, profesional.Slug)
	}
	if clinic.OwnerID != user.ID {
		t.Errorf("Clinic.OwnerID = %v, esperaba %v", clinic.OwnerID, user.ID)
	}

	var member db.ClinicMember
	if err := gdb.First(&member, "clinic_id = ? AND user_id = ?", clinic.ID, user.ID).Error; err != nil {
		t.Fatalf("no se encontró el ClinicMember migrado: %v", err)
	}
	if member.Role != db.RoleOwner || member.Status != db.ClinicMemberStatusActive {
		t.Errorf("ClinicMember Role/Status = %q/%q, esperaba %q/%q", member.Role, member.Status, db.RoleOwner, db.ClinicMemberStatusActive)
	}

	// Idempotencia: correrla de nuevo no debe duplicar nada.
	migratedSegunda, skippedSegunda, err := db.MigrateProfesionalesToUsers(gdb)
	if err != nil {
		t.Fatalf("segunda corrida: error inesperado: %v", err)
	}
	if migratedSegunda != 0 {
		t.Errorf("segunda corrida: migrated = %d, esperaba 0 (ya estaba migrado)", migratedSegunda)
	}
	if skippedSegunda < 1 {
		t.Errorf("segunda corrida: skipped = %d, esperaba al menos 1", skippedSegunda)
	}
}

func TestSplitNombreApellido_UnaSolaPalabraDejaApellidoVacio(t *testing.T) {
	gdb := testdb.New(t)

	profesional := db.Profesional{
		Nombre:        "Madonna",
		Email:         uuid.NewString() + "@example.com",
		PasswordHash:  "hash",
		NombreClinica: "Clínica Unipersonal",
		Slug:          "clinica-unipersonal-" + uuid.NewString(),
	}
	if err := gdb.Create(&profesional).Error; err != nil {
		t.Fatalf("no se pudo crear el profesional de prueba: %v", err)
	}

	if _, _, err := db.MigrateProfesionalesToUsers(gdb); err != nil {
		t.Fatalf("MigrateProfesionalesToUsers error inesperado: %v", err)
	}

	var profile db.ProfessionalProfile
	if err := gdb.Joins("JOIN users ON users.id = professional_profiles.user_id").
		Where("users.email = ?", profesional.Email).First(&profile).Error; err != nil {
		t.Fatalf("no se encontró el ProfessionalProfile migrado: %v", err)
	}
	if profile.Nombre != "Madonna" || profile.Apellido != "" {
		t.Errorf("Nombre/Apellido = %q/%q, esperaba \"Madonna\"/\"\"", profile.Nombre, profile.Apellido)
	}
}
