package db_test

import (
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

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

// TestRunMigrations_DeduplicaAntesDeCrearElIndiceUnico — test de regresión
// de un bug REAL introducido y corregido el 2026-09-08, durante la
// revisión de código de esta misma tanda.
//
// La deduplicación de pacientes existe justamente para que
// `CREATE UNIQUE INDEX idx_paciente_dni_unico` —que se re-crea sin
// IF NOT EXISTS en cada corrida— no falle contra fichas duplicadas ya
// cargadas. Al moverla a aplicarUnaVez quedó, sin querer, DESPUÉS del
// bloque de statements que crea ese índice: sobre una base con
// duplicados reales el CREATE INDEX reventaba, toda la transacción hacía
// rollback y, como los duplicados seguían ahí, el arranque siguiente
// fallaba igual — el contenedor `migrate` quedaba en un loop del que no
// se salía sin SQL a mano.
//
// El resto de la suite NO lo detecta: la base de test siempre nace
// limpia, sin duplicados — exactamente la población para la que el
// bloque de deduplicación existe. Por eso este test arma su propia base
// desde cero, con duplicados cargados ANTES de migrar.
//
// Se saltea (no falla) si el usuario de la base no puede crear bases —
// el objetivo es proteger contra la regresión donde se pueda, nunca
// volver frágil a CI por un permiso.
func TestRunMigrations_DeduplicaAntesDeCrearElIndiceUnico(t *testing.T) {
	admin, nombreBase, dsnNueva, ok := baseDeDatosDescartable(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea la regresión de orden")
	}
	gdb, err := gorm.Open(postgres.Open(dsnNueva), &gorm.Config{})
	if err != nil {
		t.Fatalf("no se pudo conectar a la base descartable: %v", err)
	}
	// El cleanup CIERRA la conexión a la base descartable antes de
	// borrarla: con una conexión abierta, Postgres rechaza el DROP
	// DATABASE ("is being accessed by other users") y la base queda
	// filtrada — pasó de verdad al escribir este test, dejó 5 bases
	// huérfanas antes de que se notara.
	t.Cleanup(func() {
		if sqlDB, err := gdb.DB(); err == nil {
			_ = sqlDB.Close()
		}
		if sqlAdmin, err := admin.DB(); err == nil {
			if _, err := sqlAdmin.Exec("DROP DATABASE IF EXISTS " + nombreBase); err != nil {
				t.Logf("no se pudo borrar la base descartable %s: %v", nombreBase, err)
			}
			_ = sqlAdmin.Close()
		}
	})

	// Esquema mínimo SIN el índice único, para poder cargar duplicados —
	// simula una base vieja, de antes de que ese índice existiera.
	// User y Clinic van también: desde la Fase C hay foreign keys, y
	// `pacientes.profesional_id` apunta a `clinics` (ver migrate_fk.go).
	// Sin esas dos tablas, el fixture no puede crear la clínica dueña de
	// las fichas duplicadas.
	if err := gdb.AutoMigrate(&db.User{}, &db.Clinic{}, &db.Paciente{}, &db.Turno{}); err != nil {
		t.Fatalf("automigrate parcial: %v", err)
	}
	// La columna `profesional_id` guarda un clinics.id, no un
	// profesionales.id — ver migrate_fk.go. La tabla `profesionales` es
	// legacy de antes de TR-037 y está vacía.
	ownerprof := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	if err := gdb.Create(&ownerprof).Error; err != nil {
		t.Fatalf("no se pudo crear el usuario dueño: %v", err)
	}
	prof := db.Clinic{Nombre: "Clínica de prueba", Tipo: "individual", Slug: uuid.NewString(), OwnerID: ownerprof.ID}
	if err := gdb.Create(&prof).Error; err != nil {
		t.Fatalf("no se pudo crear el profesional: %v", err)
	}
	for i := 0; i < 2; i++ {
		p := db.Paciente{ProfesionalID: prof.ID, Nombre: "Ficha", Apellido: "Duplicada", DNI: "30111222"}
		if err := gdb.Create(&p).Error; err != nil {
			t.Fatalf("no se pudo crear el duplicado %d: %v", i, err)
		}
	}

	// Con los duplicados ya cargados, RunMigrations tiene que poder
	// completarse: limpia primero, crea el índice después.
	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("RunMigrations falló sobre una base con duplicados preexistentes — "+
			"la deduplicación quedó DESPUÉS del CREATE UNIQUE INDEX: %v", err)
	}

	var quedan int64
	if err := gdb.Model(&db.Paciente{}).Where("profesional_id = ? AND dni = ?", prof.ID, "30111222").Count(&quedan).Error; err != nil {
		t.Fatalf("no se pudo contar: %v", err)
	}
	if quedan != 1 {
		t.Errorf("quedaron %d fichas con el mismo DNI, esperaba 1 tras la deduplicación", quedan)
	}
}

// baseDeDatosDescartable crea una base vacía a partir de la conexión de
// TEST_DATABASE_URL y devuelve el DSN para usarla. Devuelve ok=false si no
// se puede (permisos) — el caller decide saltear.
func baseDeDatosDescartable(t *testing.T) (admin *gorm.DB, nombre, dsn string, ok bool) {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		base = "postgres://dental_mirage:dental_mirage@localhost:5432/dental_mirage_test?sslmode=disable"
	}
	u, err := url.Parse(base)
	if err != nil {
		return nil, "", "", false
	}

	// Conexión administrativa a `postgres` (no a la base de test) — no se
	// puede crear una base desde adentro de otra.
	admU := *u
	admU.Path = "/postgres"
	admin, err = gorm.Open(postgres.Open(admU.String()), &gorm.Config{})
	if err != nil {
		return nil, "", "", false
	}

	nombre = "dm_regr_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "") + "_test"
	if err := admin.Exec("CREATE DATABASE " + nombre).Error; err != nil {
		return nil, "", "", false
	}

	nuevaU := *u
	nuevaU.Path = "/" + nombre
	return admin, nombre, nuevaU.String(), true
}
