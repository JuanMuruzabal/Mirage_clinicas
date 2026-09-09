package db_test

import (
	"testing"

	"dental-mirage/api/internal/db"
	"dental-mirage/api/internal/testdb"
)

// TestRunMigrations_RegistraLaDeduplicacionComoMigracionDeUnaVez — Fase B
// de la auditoría (2026-09-08, docs/Seguridad y optimizacion/): la
// deduplicación de pacientes por DNI barría la tabla ENTERA en cada
// arranque del contenedor `migrate`, para siempre — un costo que crece
// con el volumen de la base y que, después de la primera corrida, nunca
// vuelve a encontrar nada que corregir. Ahora corre una sola vez y queda
// registrada.
//
// Usa testdb.Shared por el mismo motivo que el resto de los tests que
// llaman a RunMigrations (ver el comentario grande en migrate_test.go
// sobre el advisory lock).
func TestRunMigrations_RegistraLaDeduplicacionComoMigracionDeUnaVez(t *testing.T) {
	gdb := testdb.Shared(t)

	// testdb.Shared ya corrió RunMigrations — la migración de una vez
	// tiene que estar registrada.
	var registrada db.MigracionUnaVez
	if err := gdb.Where("nombre = ?", "dedup_pacientes_por_dni").First(&registrada).Error; err != nil {
		t.Fatalf("la deduplicación no quedó registrada en migraciones_una_vez: %v", err)
	}
	if registrada.AplicadaEn.IsZero() {
		t.Error("AplicadaEn quedó en cero, esperaba la fecha de aplicación")
	}

	aplicadaOriginalmente := registrada.AplicadaEn

	// Un segundo RunMigrations (simula un redeploy) no debe volver a
	// correrla ni duplicar la fila de control.
	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("la segunda corrida de RunMigrations falló: %v", err)
	}

	var filas int64
	if err := gdb.Model(&db.MigracionUnaVez{}).Where("nombre = ?", "dedup_pacientes_por_dni").Count(&filas).Error; err != nil {
		t.Fatalf("no se pudo contar las filas de control: %v", err)
	}
	if filas != 1 {
		t.Errorf("hay %d filas de control para la misma migración, esperaba exactamente 1", filas)
	}

	var despues db.MigracionUnaVez
	if err := gdb.Where("nombre = ?", "dedup_pacientes_por_dni").First(&despues).Error; err != nil {
		t.Fatalf("no se pudo releer la fila de control: %v", err)
	}
	if !despues.AplicadaEn.Equal(aplicadaOriginalmente) {
		t.Errorf("AplicadaEn cambió (%v -> %v) — la migración volvió a correr en el segundo arranque",
			aplicadaOriginalmente, despues.AplicadaEn)
	}
}
