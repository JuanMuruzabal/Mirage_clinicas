package db_test

import (
	"testing"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
)

// La restricción `chk_*_con_duenio` se agrega NOT VALID a propósito
// (revisión de aislamiento, 2026-09-23): tiene que poder entrar en una
// base de producción aunque quede una fila VIEJA sin dueño que el
// backfill no pueda asignar, sin tumbar la migración — y con ella, el
// deploy.
//
// Este test arma exactamente ese caso, que en la base de test normal no
// se puede fabricar (la restricción ya está puesta): una base descartable,
// sin la restricción, con un horario reservado sin dueño en una clínica
// SIN titular — el backfill no tiene a quién dárselo. Y exige tres cosas:
//
//  1. que la migración termine bien igual;
//  2. que la restricción quede puesta, aunque sin validar;
//  3. que igual rechace las filas NUEVAS sin dueño, que es lo que importa.
func TestMigraciones_ConFilasViejasSinDuenioLaRestriccionEntraSinValidar(t *testing.T) {
	gdb, ok := baseDescartableConMigracionesAplicadas(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea")
	}

	// Una base "de antes": sin la restricción.
	if err := gdb.Exec(`ALTER TABLE bloqueos_horario DROP CONSTRAINT chk_bloqueo_horario_con_duenio`).Error; err != nil {
		t.Fatalf("no se pudo sacar la restricción: %v", err)
	}

	// Una clínica sin titular: el backfill no tiene a quién asignarle la
	// fila, así que va a quedar sin dueño pase lo que pase.
	creador := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	if err := gdb.Create(&creador).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario: %v", err)
	}
	clinica := db.Clinic{Nombre: "Sin titular", Tipo: "individual", Slug: uuid.NewString(), OwnerID: creador.ID}
	if err := gdb.Create(&clinica).Error; err != nil {
		t.Fatalf("no se pudo crear la clínica: %v", err)
	}
	if err := gdb.Exec(`INSERT INTO bloqueos_horario (clinic_id, especifico, fecha, hora_desde, hora_hasta, tipo_regla)
		VALUES (?, true, current_date + 3, '08:00', '09:00', 'bloquear_horario')`, clinica.ID).Error; err != nil {
		t.Fatalf("no se pudo crear la fila vieja sin dueño: %v", err)
	}

	// 1. La migración termina bien igual.
	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("la migración falló por una fila vieja sin dueño — esto tumbaría un deploy: %v", err)
	}

	// 2. La restricción está, sin validar (la fila vieja no la deja).
	var validada bool
	if err := gdb.Raw(`SELECT convalidated FROM pg_constraint WHERE conname = 'chk_bloqueo_horario_con_duenio'`).
		Scan(&validada).Error; err != nil {
		t.Fatalf("no se pudo leer la restricción: %v", err)
	}
	if validada {
		t.Error("la restricción quedó validada con una fila sin dueño adentro — no debería poder")
	}

	// 3. Y aun sin validar, rechaza las NUEVAS.
	err := gdb.Exec(`INSERT INTO bloqueos_horario (clinic_id, especifico, fecha, hora_desde, hora_hasta, tipo_regla)
		VALUES (?, true, current_date + 3, '10:00', '11:00', 'bloquear_horario')`, clinica.ID).Error
	if err == nil {
		t.Error("una fila NUEVA sin dueño entró: la restricción sin validar no está cumpliendo su parte")
	}
}
