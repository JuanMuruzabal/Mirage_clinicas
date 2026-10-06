package db_test

import (
	"strings"
	"testing"

	"dental-mirage/api/internal/db"
)

// drop_trazo_de_documento_asientos (5.6d): la columna `trazo` cuenta como
// impacto aunque la tabla esté vacía —su NOT NULL igual tiene que irse—, así
// que con una política restrictiva frena; con permiso la borra, y una
// segunda corrida no hace nada (queda registrada).
func TestDestructiva_DropTrazoCorreConLaTablaVacia(t *testing.T) {
	gdb, ok := baseDescartableConMigracionesAplicadas(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea")
	}
	if err := gdb.Exec(`ALTER TABLE documento_asientos ADD COLUMN IF NOT EXISTS trazo jsonb NOT NULL DEFAULT '{}'`).Error; err != nil {
		t.Fatalf("no se pudo reponer la columna: %v", err)
	}
	if err := gdb.Exec(`DELETE FROM migraciones_una_vez WHERE nombre = 'drop_trazo_de_documento_asientos'`).Error; err != nil {
		t.Fatalf("no se pudo desregistrar la migración: %v", err)
	}
	var filas int64
	if err := gdb.Raw(`SELECT count(*) FROM documento_asientos`).Scan(&filas).Error; err != nil || filas != 0 {
		t.Fatalf("la tabla tiene que estar vacía: %d %v", filas, err)
	}

	restrictiva := db.PoliticaDestructiva{Permitir: false, Entorno: "production"}
	err := db.RunMigrationsConPolitica(gdb, restrictiva)
	if err == nil || !strings.Contains(err.Error(), "drop_trazo_de_documento_asientos") || !strings.Contains(err.Error(), "1 elemento") {
		t.Fatalf("con la tabla vacía la columna cuenta como 1 y frena: %v", err)
	}
	if !columnaExiste(t, gdb, "documento_asientos", "trazo") {
		t.Fatal("frenó después de borrar la columna")
	}

	if err := db.RunMigrationsConPolitica(gdb, db.PoliticaDestructiva{Permitir: true, Entorno: "staging"}); err != nil {
		t.Fatalf("con permiso tiene que correr: %v", err)
	}
	if columnaExiste(t, gdb, "documento_asientos", "trazo") {
		t.Fatal("la columna `trazo` tendría que haberse ido")
	}

	// Segunda corrida: registrada, no hace nada aunque la política frene.
	if err := db.RunMigrationsConPolitica(gdb, restrictiva); err != nil {
		t.Fatalf("una segunda corrida no tiene nada que hacer: %v", err)
	}
	var registradas int64
	if err := gdb.Raw(`SELECT count(*) FROM migraciones_una_vez WHERE nombre = 'drop_trazo_de_documento_asientos'`).Scan(&registradas).Error; err != nil || registradas != 1 {
		t.Fatalf("la migración queda registrada una vez: %d %v", registradas, err)
	}
}

// Sin la columna (producción: nunca llegó), el impacto es 0: corre aun con
// la política restrictiva, sin tocar nada, y queda registrada.
func TestDestructiva_DropTrazoSinLaColumnaNoHaceNada(t *testing.T) {
	gdb, ok := baseDescartableConMigracionesAplicadas(t)
	if !ok {
		t.Skip("no se pudo crear una base descartable (permisos) — se saltea")
	}
	if columnaExiste(t, gdb, "documento_asientos", "trazo") {
		t.Fatal("después de migrar la columna no debería existir")
	}
	if err := gdb.Exec(`DELETE FROM migraciones_una_vez WHERE nombre = 'drop_trazo_de_documento_asientos'`).Error; err != nil {
		t.Fatalf("no se pudo desregistrar la migración: %v", err)
	}
	if err := db.RunMigrationsConPolitica(gdb, db.PoliticaDestructiva{Permitir: false, Entorno: "production"}); err != nil {
		t.Fatalf("sin la columna no hay nada que frenar: %v", err)
	}
	var registradas int64
	if err := gdb.Raw(`SELECT count(*) FROM migraciones_una_vez WHERE nombre = 'drop_trazo_de_documento_asientos'`).Scan(&registradas).Error; err != nil || registradas != 1 {
		t.Fatalf("igual queda registrada: %d %v", registradas, err)
	}
}
