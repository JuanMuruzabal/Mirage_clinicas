package db_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

func TestRunMigrations_RechazaSolapamientoDeTurnosAgendados(t *testing.T) {
	gdb := testdb.New(t)

	profesionalID := crearProfesionalDePrueba(t, gdb)

	inicio := time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
	fin := inicio.Add(30 * time.Minute)

	turno1 := turnoAgendadoDePrueba(profesionalID, inicio, fin)
	if err := gdb.Create(&turno1).Error; err != nil {
		t.Fatalf("el primer turno debería poder crearse: %v", err)
	}

	// Se solapa parcialmente con el primero (empieza 15 min después, dentro
	// del rango del anterior) — spec §4.3, regla no negociable.
	turno2 := turnoAgendadoDePrueba(profesionalID, inicio.Add(15*time.Minute), fin.Add(15*time.Minute))
	err := gdb.Create(&turno2).Error
	if err == nil {
		t.Fatal("esperaba que el segundo turno solapado fallara por el exclusion constraint, pero no falló")
	}
}

func TestRunMigrations_PermiteTurnosNoSolapados(t *testing.T) {
	gdb := testdb.New(t)

	profesionalID := crearProfesionalDePrueba(t, gdb)

	inicio := time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
	turno1 := turnoAgendadoDePrueba(profesionalID, inicio, inicio.Add(30*time.Minute))
	if err := gdb.Create(&turno1).Error; err != nil {
		t.Fatalf("el primer turno debería poder crearse: %v", err)
	}

	// Arranca justo cuando termina el anterior — no se solapa.
	turno2 := turnoAgendadoDePrueba(profesionalID, inicio.Add(30*time.Minute), inicio.Add(60*time.Minute))
	if err := gdb.Create(&turno2).Error; err != nil {
		t.Errorf("dos turnos consecutivos sin solapar no deberían fallar: %v", err)
	}
}

// TestRunMigrations_CanceladaNuncaConflictuaAunqueElHorarioSeaIgual —
// TR-104: el estado `pendiente` se sacó del todo (antes probaba que un
// turno `pendiente`, sin horario fijo, nunca podía chocar con el
// constraint). El único otro estado que queda además de `agendado` es
// `cancelada`, que SÍ tiene horario fijo (chk_turno_agendado_horario ya no
// distingue por estado la obligatoriedad de horario) — el exclusion
// constraint sigue excluyéndolo igual, vía su propio WHERE (estado =
// 'agendado'), así que un turno cancelado con el MISMO horario que uno
// agendado nunca debería chocar: cancelar tiene que liberar el horario de
// verdad, no solo "de palabra".
func TestRunMigrations_CanceladaNuncaConflictuaAunqueElHorarioSeaIgual(t *testing.T) {
	gdb := testdb.New(t)

	profesionalID := crearProfesionalDePrueba(t, gdb)

	inicio := time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
	fin := inicio.Add(30 * time.Minute)

	agendado := turnoAgendadoDePrueba(profesionalID, inicio, fin)
	if err := gdb.Create(&agendado).Error; err != nil {
		t.Fatalf("el turno agendado debería poder crearse: %v", err)
	}

	cancelada := turnoAgendadoDePrueba(profesionalID, inicio, fin)
	cancelada.Estado = "cancelada"
	if err := gdb.Create(&cancelada).Error; err != nil {
		t.Errorf("un turno cancelado nunca debería chocar con el constraint, aunque tenga el mismo horario: %v", err)
	}
}

// TestRunMigrations_NoMergeaFichasEnConflictoDeVerdad — corrección de bug
// real encontrado en QA en vivo (Fase 2.4.1, 2026-09-04): el bloque de
// de-duplicación de pacientes (Extra 2.3.5/E5.1, más arriba en
// runMigrationsLocked) corre en CADA RunMigrations — cada reinicio/deploy
// del contenedor `migrate`, no una sola vez — y hasta esta corrección
// agrupaba por (profesional_id, dni) sin excluir `en_conflicto`. Eso
// borraba en silencio, en cada deploy, cualquier ficha creada A PROPÓSITO
// por un conflicto de pacientes sin resolver (mismo DNI, mail distinto,
// ver crearPacientePublicoConDeteccionDeConflicto en
// internal/http/paciente_conflicto_publico.go) — reasignando su turno a
// la otra ficha SIN pasar por ConflictoPaciente ni por
// migrarOCancelarTurnosDePerdedor, deshaciendo toda la detección de
// conflicto. Repite RunMigrations una segunda vez a propósito (simula un
// redeploy) para probar exactamente ese escenario.
//
// Usa testdb.Shared, no testdb.New: RunMigrations toma un
// pg_advisory_xact_lock (migrate.go) — llamarlo sobre una transacción de
// test ya abierta (testdb.New) anida un SAVEPOINT dentro de ella, y ese
// segundo intento de tomar el mismo lock mientras la transacción externa
// sigue abierta puede autobloquearse contra otro paquete de test corriendo
// en paralelo (deadlock real visto al escribir este test). Sobre
// testdb.Shared, RunMigrations corre como una transacción de verdad,
// igual que en el contenedor `migrate` de producción — limpieza manual al
// final, con un DNI/profesional exclusivos de este test para no chocar
// con nada más que corra en paralelo sobre la misma base compartida.
func TestRunMigrations_NoMergeaFichasEnConflictoDeVerdad(t *testing.T) {
	gdb := testdb.Shared(t)

	dni := "459" + uuid.NewString()[:5]
	profesional := db.Profesional{
		Nombre: "Profesional de prueba", Email: uuid.NewString() + "@example.com",
		PasswordHash: "hash-de-prueba", NombreClinica: "Clínica de prueba", Slug: uuid.NewString(),
	}
	if err := gdb.Create(&profesional).Error; err != nil {
		t.Fatalf("no se pudo crear el profesional de prueba: %v", err)
	}
	t.Cleanup(func() {
		gdb.Unscoped().Where("profesional_id = ?", profesional.ID).Delete(&db.Turno{})
		gdb.Unscoped().Where("profesional_id = ?", profesional.ID).Delete(&db.Paciente{})
		gdb.Unscoped().Delete(&profesional)
	})

	verificada := db.Paciente{
		ProfesionalID: profesional.ID, Nombre: "Jose", Apellido: "Raton",
		DNI: dni, Telefono: "+5493511111111", Origen: "pagina_publica",
	}
	if err := gdb.Create(&verificada).Error; err != nil {
		t.Fatalf("no se pudo crear la ficha original de prueba: %v", err)
	}
	enConflicto := db.Paciente{
		ProfesionalID: profesional.ID, Nombre: "Juan", Apellido: "M",
		DNI: dni, Telefono: "+5493512222222", EnConflicto: true, Origen: "pagina_publica",
	}
	if err := gdb.Create(&enConflicto).Error; err != nil {
		t.Fatalf("no se pudo crear la ficha en conflicto de prueba: %v", err)
	}

	inicio := time.Now().Add(1 * time.Hour)
	fin := inicio.Add(30 * time.Minute)
	turno := db.Turno{
		ProfesionalID: profesional.ID, PacienteID: &enConflicto.ID, Estado: "agendado",
		HoraInicio: &inicio, HoraFin: &fin,
		NombreContacto: "Juan", ApellidoContacto: "M", DNIContacto: dni,
		TelefonoContacto: "+5493512222222", EmailContacto: "juan@example.com", Origen: "pagina_publica",
	}
	if err := gdb.Create(&turno).Error; err != nil {
		t.Fatalf("no se pudo crear el turno de prueba: %v", err)
	}

	// Simula un redeploy: correr RunMigrations de nuevo NO debe tocar
	// ninguna de las dos fichas ni reasignar el turno.
	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("RunMigrations (segunda corrida) error inesperado: %v", err)
	}

	var countEnConflicto int64
	gdb.Model(&db.Paciente{}).Where("id = ?", enConflicto.ID).Count(&countEnConflicto)
	if countEnConflicto != 1 {
		t.Errorf("la ficha en conflicto debería seguir existiendo, count=%d", countEnConflicto)
	}

	var turnoActualizado db.Turno
	if err := gdb.First(&turnoActualizado, "id = ?", turno.ID).Error; err != nil {
		t.Fatalf("no se pudo releer el turno: %v", err)
	}
	if turnoActualizado.PacienteID == nil || *turnoActualizado.PacienteID != enConflicto.ID {
		t.Errorf("el turno se reasignó a otra ficha, PacienteID = %v, esperaba %v", turnoActualizado.PacienteID, enConflicto.ID)
	}
}

func TestSeedTiposConsultaDefault_CreaLosDosTiposConSusColores(t *testing.T) {
	gdb := testdb.New(t)
	profesionalID := crearProfesionalDePrueba(t, gdb)

	if err := db.SeedTiposConsultaDefault(gdb, profesionalID); err != nil {
		t.Fatalf("SeedTiposConsultaDefault error inesperado: %v", err)
	}

	var tipos []db.TipoConsulta
	if err := gdb.Where("profesional_id = ?", profesionalID).Order("nombre").Find(&tipos).Error; err != nil {
		t.Fatalf("no se pudo leer tipos_consulta: %v", err)
	}
	if len(tipos) != 2 {
		t.Fatalf("len(tipos) = %d, esperaba 2", len(tipos))
	}

	byName := map[string]string{}
	for _, tc := range tipos {
		byName[tc.Nombre] = tc.Color
	}
	if byName[db.NombreTipoConsultaGeneral] != db.ColorTipoConsultaGeneral {
		t.Errorf("color de %q = %q, esperaba %q", db.NombreTipoConsultaGeneral, byName[db.NombreTipoConsultaGeneral], db.ColorTipoConsultaGeneral)
	}
	if byName[db.NombreTipoConsultaUrgencia] != db.ColorTipoConsultaUrgencia {
		t.Errorf("color de %q = %q, esperaba %q", db.NombreTipoConsultaUrgencia, byName[db.NombreTipoConsultaUrgencia], db.ColorTipoConsultaUrgencia)
	}
}

// crearProfesionalDePrueba inserta un Profesional mínimo (los tests de
// turnos solo necesitan un profesional_id válido para el exclusion
// constraint, no un flujo de registro completo).
func crearProfesionalDePrueba(t *testing.T, gdb *gorm.DB) uuid.UUID {
	t.Helper()
	p := db.Profesional{
		Nombre:        "Profesional de prueba",
		Email:         uuid.NewString() + "@example.com",
		PasswordHash:  "hash-de-prueba",
		NombreClinica: "Clínica de prueba",
		Slug:          uuid.NewString(),
	}
	if err := gdb.Create(&p).Error; err != nil {
		t.Fatalf("no se pudo crear el profesional de prueba: %v", err)
	}
	return p.ID
}

// turnoAgendadoDePrueba arma un Turno ya `agendado` (con horario fijo,
// spec §4.3) listo para insertar — los campos de contacto son obligatorios
// a nivel de esquema aunque el turno ya no esté `pendiente`.
func turnoAgendadoDePrueba(profesionalID uuid.UUID, inicio, fin time.Time) db.Turno {
	return db.Turno{
		ProfesionalID:    profesionalID,
		Estado:           "agendado",
		HoraInicio:       &inicio,
		HoraFin:          &fin,
		NombreContacto:   "Paciente",
		ApellidoContacto: "De Prueba",
		DNIContacto:      "30999888",
		TelefonoContacto: "+5493511234567",
		EmailContacto:    "paciente@example.com",
		Origen:           "manual",
	}
}
