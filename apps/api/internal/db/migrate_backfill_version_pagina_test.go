package db_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// TestRunMigrations_BackfillVersion1DeUnaPaginaYaPublicada — PE-8 (plan
// Prisma Engine): con el borrador/versión separados, GET /clinicas/{slug}
// pasa a leer la ÚLTIMA PaginaPublicaVersion, no la fila en vivo. Una
// página que ya se había publicado ANTES de este cambio (deployada_en no
// nulo) se quedaría sin ninguna versión y sus visitantes verían "en
// preparación" en vez del contenido que ya tenían — este backfill genera
// esa versión 1 con el contenido actual.
//
// Mismo patrón que TestRunMigrations_DeduplicaAntesDeCrearElIndiceUnico
// (migrate_una_vez_test.go): una base descartable, sembrada con el estado
// "de antes" ANTES de correr RunMigrations — la base de test compartida ya
// migró (y ya corrió el backfill, sin nada que hacer, porque nace vacía),
// así que la única forma de ejercitar el backfill de verdad es una base
// nueva con datos previos.
func TestRunMigrations_BackfillVersion1DeUnaPaginaYaPublicada(t *testing.T) {
	admin, nombreBase, dsnNueva, ok := baseDeDatosDescartable(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea la regresión de backfill")
	}
	gdb := conectarBaseDescartable(t, admin, nombreBase, dsnNueva)

	// Esquema mínimo — User/Clinic/ClinicMember/ClinicMemberRole para que
	// db.OwnerDeLaClinica pueda resolver un autor, PaginaPublica/
	// PaginaPublicaModulo para el contenido a copiar. PaginaPublicaVersion
	// NO se automigra a mano: tiene que salir de db.RunMigrations, igual
	// que en producción.
	if err := gdb.AutoMigrate(&db.User{}, &db.Clinic{}, &db.ClinicMember{}, &db.ClinicMemberRole{}, &db.PaginaPublica{}, &db.PaginaPublicaModulo{}); err != nil {
		t.Fatalf("automigrate parcial: %v", err)
	}

	owner := db.User{Email: uuid.NewString() + "@example.com", OnboardingStep: "completo"}
	if err := gdb.Create(&owner).Error; err != nil {
		t.Fatalf("no se pudo crear el owner: %v", err)
	}
	clinic := db.Clinic{Nombre: "Clínica Vieja", Tipo: "individual", Slug: uuid.NewString(), OwnerID: owner.ID}
	if err := gdb.Create(&clinic).Error; err != nil {
		t.Fatalf("no se pudo crear la clínica: %v", err)
	}
	member := db.ClinicMember{ClinicID: clinic.ID, UserID: owner.ID, Status: db.ClinicMemberStatusActive}
	if err := gdb.Create(&member).Error; err != nil {
		t.Fatalf("no se pudo crear el miembro: %v", err)
	}
	if err := gdb.Create(&db.ClinicMemberRole{ClinicMemberID: member.ID, Rol: db.RoleOwner}).Error; err != nil {
		t.Fatalf("no se pudo asignar el rol owner: %v", err)
	}

	bio := "Ya publicada antes de PE-8"
	deployadaEn := time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)
	pagina := db.PaginaPublica{ClinicID: clinic.ID, Bio: &bio, Tema: "calido", DeployadaEn: &deployadaEn}
	if err := gdb.Create(&pagina).Error; err != nil {
		t.Fatalf("no se pudo crear la página: %v", err)
	}
	modulo := db.PaginaPublicaModulo{PaginaPublicaID: pagina.ID, Tipo: "sobre_nosotros", Orden: 0, Visible: true}
	if err := gdb.Create(&modulo).Error; err != nil {
		t.Fatalf("no se pudo crear el módulo: %v", err)
	}

	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("RunMigrations falló: %v", err)
	}

	var version db.PaginaPublicaVersion
	if err := gdb.Where("pagina_publica_id = ?", pagina.ID).First(&version).Error; err != nil {
		t.Fatalf("no se creó ninguna versión para la página ya publicada: %v", err)
	}
	if version.Numero != 1 {
		t.Errorf("Numero = %d, esperaba 1", version.Numero)
	}
	if !version.PublicadaEn.Equal(deployadaEn) {
		t.Errorf("PublicadaEn = %v, esperaba %v (la fecha original de deployada_en)", version.PublicadaEn, deployadaEn)
	}
	if version.PublicadaPorUserID == nil || *version.PublicadaPorUserID != owner.ID {
		t.Errorf("PublicadaPorUserID = %v, esperaba el owner %s", version.PublicadaPorUserID, owner.ID)
	}
	if version.Contenido.Bio == nil || *version.Contenido.Bio != bio {
		t.Errorf("Contenido.Bio = %v, esperaba %q", version.Contenido.Bio, bio)
	}
	if len(version.Contenido.Modulos) != 1 || version.Contenido.Modulos[0].Tipo != "sobre_nosotros" {
		t.Errorf("Contenido.Modulos = %+v, esperaba 1 módulo sobre_nosotros", version.Contenido.Modulos)
	}

	// Idempotente: un segundo RunMigrations no duplica la versión 1.
	if err := db.RunMigrations(gdb); err != nil {
		t.Fatalf("segunda corrida de RunMigrations falló: %v", err)
	}
	var total int64
	gdb.Model(&db.PaginaPublicaVersion{}).Where("pagina_publica_id = ?", pagina.ID).Count(&total)
	if total != 1 {
		t.Errorf("hay %d versiones tras dos corridas, esperaba exactamente 1", total)
	}
}

// conectarBaseDescartable abre la base que baseDeDatosDescartable creó y
// registra su propio cleanup — separado para que este archivo no dependa
// del cleanup inline de migrate_una_vez_test.go.
func conectarBaseDescartable(t *testing.T, admin *gorm.DB, nombreBase, dsn string) *gorm.DB {
	t.Helper()
	gdb, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("no se pudo conectar a la base descartable: %v", err)
	}
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
	return gdb
}
