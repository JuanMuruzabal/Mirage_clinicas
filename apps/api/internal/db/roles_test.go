package db_test

import (
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// miembroDePrueba crea un usuario, una clínica y su membresía, sin roles.
func miembroDePrueba(t *testing.T, gdb *gorm.DB) uuid.UUID {
	t.Helper()
	hash := "hash-de-prueba"
	user := db.User{Email: uuid.NewString() + "@example.com", PasswordHash: &hash}
	if err := gdb.Create(&user).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario de prueba: %v", err)
	}
	clinic := db.Clinic{OwnerID: user.ID, Nombre: "Clínica", Slug: "clinica-" + uuid.NewString(), Tipo: db.ClinicTipoIndividual}
	if err := gdb.Create(&clinic).Error; err != nil {
		t.Fatalf("no se pudo crear la clínica de prueba: %v", err)
	}
	member := db.ClinicMember{ClinicID: clinic.ID, UserID: user.ID, Status: db.ClinicMemberStatusActive}
	if err := gdb.Create(&member).Error; err != nil {
		t.Fatalf("no se pudo crear la membresía de prueba: %v", err)
	}
	return member.ID
}

// TestRoles_ProfesionalYRecepcionSonExcluyentes — LA regla del brief, y la
// razón por la que los roles son una tabla con un índice único parcial en
// vez de una columna array o un check.
//
// El brief es explícito: "el rol profesional y recepción son excluyentes
// (puede ser profesional o recepción) nunca los 2". El que la hace cumplir
// es el MOTOR, no la aplicación — mismo criterio que el no-solapamiento de
// turnos (spec §4.3). Este test lo prueba en las dos direcciones, que es lo
// que distingue una regla real de una que solo frena el caso obvio.
func TestRoles_ProfesionalYRecepcionSonExcluyentes(t *testing.T) {
	gdb := testdb.New(t)
	memberID := miembroDePrueba(t, gdb)

	if err := db.AsignarRol(gdb, memberID, db.RoleProfesional); err != nil {
		t.Fatalf("asignar profesional debería andar: %v", err)
	}
	err := db.AsignarRol(gdb, memberID, db.RoleRecepcion)
	if err == nil {
		t.Fatal("un profesional no puede ser además recepcionista")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "duplicate key") {
		t.Errorf("el rechazo debería venir del índice único parcial, no de la aplicación: %v", err)
	}
}

// TestRoles_RecepcionYProfesionalTambienSonExcluyentes — la misma regla en
// la dirección contraria.
//
// Va en su propio test y no como un segundo caso del anterior por una
// razón concreta de Postgres: cuando un INSERT viola una constraint, la
// transacción entera queda abortada (25P02) y todo lo que siga falla con un
// error que no tiene nada que ver. Los tests corren dentro de una
// transacción revertida (testdb), así que cada violación esperada necesita
// la suya.
func TestRoles_RecepcionYProfesionalTambienSonExcluyentes(t *testing.T) {
	gdb := testdb.New(t)
	memberID := miembroDePrueba(t, gdb)

	if err := db.AsignarRol(gdb, memberID, db.RoleRecepcion); err != nil {
		t.Fatalf("asignar recepción debería andar: %v", err)
	}
	if err := db.AsignarRol(gdb, memberID, db.RoleProfesional); err == nil {
		t.Error("un recepcionista no puede ser además profesional")
	}
}

// TestRoles_AdminYOwnerSeAcumulan — la otra mitad de la regla, y la que
// hace falta para el caso que el brief describe como normal: "la tarjeta
// del titular... por default siempre tiene el rol de profesional y con el
// rol de administrador de página".
//
// Si el índice parcial estuviera mal escrito —sin el WHERE, por ejemplo—
// este test fallaría y el de arriba pasaría igual. Por eso van juntos.
func TestRoles_AdminYOwnerSeAcumulan(t *testing.T) {
	gdb := testdb.New(t)
	memberID := miembroDePrueba(t, gdb)

	for _, rol := range []string{db.RoleProfesional, db.RoleAdmin, db.RoleOwner} {
		if err := db.AsignarRol(gdb, memberID, rol); err != nil {
			t.Fatalf("asignar %q debería andar: %v", rol, err)
		}
	}

	var member db.ClinicMember
	if err := gdb.Preload("Roles").First(&member, "id = ?", memberID).Error; err != nil {
		t.Fatalf("no se pudo releer el miembro: %v", err)
	}
	if len(member.Roles) != 3 {
		t.Errorf("roles = %d, esperaba 3 acumulados", len(member.Roles))
	}
	if rol := db.RolPrincipal(member.Roles); rol != db.RoleOwner {
		t.Errorf("RolPrincipal = %q, esperaba %q (el de mayor alcance)", rol, db.RoleOwner)
	}
}

// TestRoles_AsignarDosVecesElMismoNoDuplica — AsignarRol se llama desde el
// onboarding y desde el panel de colaboradores; repetirlo no puede romper
// ni duplicar.
func TestRoles_AsignarDosVecesElMismoNoDuplica(t *testing.T) {
	gdb := testdb.New(t)
	memberID := miembroDePrueba(t, gdb)

	for i := 0; i < 3; i++ {
		if err := db.AsignarRol(gdb, memberID, db.RoleAdmin); err != nil {
			t.Fatalf("repetir la asignación no debería fallar (intento %d): %v", i+1, err)
		}
	}
	var n int64
	gdb.Model(&db.ClinicMemberRole{}).Where("clinic_member_id = ?", memberID).Count(&n)
	if n != 1 {
		t.Errorf("filas = %d, esperaba 1", n)
	}
}

// TestRolPrincipal_SinRolesDevuelveVacio — un miembro invitado que todavía
// no aceptó no tiene roles, y eso no puede explotar.
func TestRolPrincipal_SinRolesDevuelveVacio(t *testing.T) {
	if rol := db.RolPrincipal(nil); rol != "" {
		t.Errorf("RolPrincipal(nil) = %q, esperaba vacío", rol)
	}
}
