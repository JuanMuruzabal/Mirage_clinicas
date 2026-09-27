package db_test

import (
	"testing"

	"github.com/google/uuid"

	"dental-mirage/api/internal/db"
)

// TestRunMigrations_BienvenidaALasCuentasExistentes — TR-179: las cuentas
// que ya existían cuando llegaron las notificaciones reciben su bienvenida,
// UNA sola vez. Como el backfill de PE-8, se prueba sobre una base
// descartable: la de tests ya corrió la migración (sin usuarios todavía),
// así que es la única forma de ejercitarla de verdad.
func TestRunMigrations_BienvenidaALasCuentasExistentes(t *testing.T) {
	admin, nombreBase, dsnNueva, ok := baseDeDatosDescartable(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea la regresión de la bienvenida")
	}
	gdb := conectarBaseDescartable(t, admin, nombreBase, dsnNueva)

	if err := gdb.AutoMigrate(&db.User{}); err != nil {
		t.Fatalf("automigrate parcial: %v", err)
	}
	existentes := []db.User{
		{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"},
		{Email: uuid.NewString() + "@example.com", OnboardingStep: "perfil"},
	}
	if err := gdb.Create(&existentes).Error; err != nil {
		t.Fatalf("no se pudieron crear las cuentas: %v", err)
	}

	for corrida := 1; corrida <= 2; corrida++ {
		if err := db.RunMigrations(gdb); err != nil {
			t.Fatalf("RunMigrations (corrida %d): %v", corrida, err)
		}
		for _, u := range existentes {
			var n int64
			gdb.Model(&db.Notificacion{}).Where("user_id = ? AND tipo = ?", u.ID, db.NotificacionBienvenida).Count(&n)
			if n != 1 {
				t.Errorf("corrida %d: la cuenta %s tiene %d bienvenidas, esperaba 1", corrida, u.Email, n)
			}
			// La fecha también: el INSERT ... SELECT no pasa por GORM, y sin
			// ella la tarjeta mostraba el epoch ("31 dic").
			var sinFecha int64
			gdb.Model(&db.Notificacion{}).Where("user_id = ? AND created_at IS NULL", u.ID).Count(&sinFecha)
			if sinFecha != 0 {
				t.Errorf("corrida %d: la bienvenida de %s quedó sin fecha", corrida, u.Email)
			}
		}
	}
}
