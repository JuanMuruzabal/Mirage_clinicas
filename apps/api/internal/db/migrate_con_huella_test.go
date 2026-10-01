package db

import (
	"fmt"
	"regexp"
	"strings"
	"sync"
	"testing"

	"gorm.io/gorm"
)

// Una migración repetida no toma locks de tabla ni ejecuta DDL.
//
// Bug real de CI (PR #83, 2026-10-01): `deadlock detected (SQLSTATE 40P01)`
// en un SELECT sobre documentos_clinicos dentro de un test de otro paquete.
// `go test ./internal/...` corre los paquetes en paralelo contra la misma
// base y cada uno llama a RunMigrations; el advisory lock serializa las
// migraciones entre sí, pero no contra los tests ya en marcha, y cada
// corrida re-ejecutaba DROP/ADD CONSTRAINT, CREATE OR REPLACE TRIGGER, etc.
// aunque nada hubiera cambiado: locks fuertes de tabla que arman el ciclo.
// Si estos tests fallan, un paso nuevo de migrate*.go se ejecuta en cada
// corrida: envolvelo con reemplazarConstraint/reemplazarTrigger/
// reemplazarIndice (si su SQL puede cambiar) o con crear*SiFalta /
// ...SiHaceFalta (si no).

var ddlProhibido = regexp.MustCompile(`(?i)\b(ALTER\s+(TABLE|INDEX)|DROP\s+|CREATE\s+(UNIQUE\s+)?INDEX|CREATE\s+(OR\s+REPLACE\s+)?TRIGGER|VALIDATE\s+CONSTRAINT|TRUNCATE)\b`)

// espiarSentencias registra todo SQL que pasa por Exec/Raw de gdb; la
// función devuelta da lo visto hasta el momento. Se desregistra sola al
// terminar el test.
func espiarSentencias(t *testing.T, gdb *gorm.DB) func() []string {
	t.Helper()
	var mu sync.Mutex
	var vistas []string
	nombre := "espia_" + strings.ReplaceAll(t.Name(), "/", "_")
	err := gdb.Callback().Raw().Before("gorm:raw").Register(nombre, func(d *gorm.DB) {
		mu.Lock()
		defer mu.Unlock()
		vistas = append(vistas, d.Statement.SQL.String())
	})
	if err != nil {
		t.Fatalf("no se pudo registrar el espía de SQL: %v", err)
	}
	t.Cleanup(func() { _ = gdb.Callback().Raw().Remove(nombre) })
	return func() []string {
		mu.Lock()
		defer mu.Unlock()
		return append([]string(nil), vistas...)
	}
}

func TestRunMigrations_UnaCorridaRepetidaNoTomaLocksNiEjecutaDDL(t *testing.T) {
	gdb := conexionDePrueba(t)
	// Primera corrida (confirmada): deja la base migrada y con huellas.
	if err := RunMigrations(gdb); err != nil {
		t.Fatalf("la primera corrida falló: %v", err)
	}

	vistas := espiarSentencias(t, gdb)
	tx := gdb.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()

	if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", lockKeyMigraciones).Error; err != nil {
		t.Fatal(err)
	}
	if err := runMigrationsLocked(tx, PoliticaDestructiva{Permitir: true, Entorno: "development"}); err != nil {
		t.Fatalf("la segunda corrida falló: %v", err)
	}

	// Locks de tabla fuertes que sigue teniendo ESTA transacción antes del rollback.
	type lockFila struct {
		Relacion string
		Modo     string
	}
	var locks []lockFila
	if err := tx.Raw(`SELECT c.relname AS relacion, l.mode AS modo
		FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE l.pid = pg_backend_pid() AND l.locktype = 'relation' AND l.granted
		  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
		  AND l.mode IN ('AccessExclusiveLock','ExclusiveLock','ShareRowExclusiveLock','ShareLock','ShareUpdateExclusiveLock')
		ORDER BY 1, 2`).Scan(&locks).Error; err != nil {
		t.Fatal(err)
	}
	for _, l := range locks {
		t.Errorf("la migración repetida tomó %s sobre %q: algún paso se re-ejecuta en cada corrida", l.Modo, l.Relacion)
	}

	for _, s := range vistas() {
		// Un bloque DO con renombres guardados por un IF no ejecuta DDL cuando
		// no hay nada que renombrar; si lo ejecutara, lo delataría el lock.
		if strings.HasPrefix(strings.TrimSpace(s), "DO") {
			continue
		}
		if ddlProhibido.MatchString(s) {
			t.Errorf("la migración repetida ejecutó DDL: %s", strings.TrimSpace(s))
		}
	}
}

// --- pasoConHuella / pasoSiHaceFalta, sobre una tabla propia del test ---

// tablaDeHuellaDePrueba abre una transacción (revertida al final) con una
// tabla t_huella_prueba y la tabla de huellas lista. Devuelve también cuántas
// sentencias ejecutadas contienen `fragmento`.
func tablaDeHuellaDePrueba(t *testing.T, fragmento string) (*gorm.DB, func() int) {
	t.Helper()
	gdb := conexionDePrueba(t)
	if err := RunMigrations(gdb); err != nil {
		t.Fatal(err)
	}
	vistas := espiarSentencias(t, gdb)
	tx := gdb.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	t.Cleanup(func() { tx.Rollback() })
	if err := crearTablaDeHuellas(tx); err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec(`CREATE TABLE t_huella_prueba (n int)`).Error; err != nil {
		t.Fatal(err)
	}
	return tx, func() int {
		n := 0
		for _, s := range vistas() {
			if strings.Contains(s, fragmento) {
				n++
			}
		}
		return n
	}
}

func TestAplicarSiCambio_CorreUnaVezYVuelveACorrerSiCambiaElSQLOSiFalta(t *testing.T) {
	tx, corridas := tablaDeHuellaDePrueba(t, "ADD CONSTRAINT chk_t_huella")
	paso := func(limite int) pasoConHuella {
		return reemplazarConstraint("t_huella_prueba", "chk_t_huella",
			`ALTER TABLE t_huella_prueba DROP CONSTRAINT IF EXISTS chk_t_huella`,
			fmt.Sprintf(`ALTER TABLE t_huella_prueba ADD CONSTRAINT chk_t_huella CHECK (n < %d)`, limite))
	}
	correr := func(p pasoConHuella, esperadas int, motivo string) {
		t.Helper()
		if err := aplicarSiCambio(tx, p); err != nil {
			t.Fatal(err)
		}
		if n := corridas(); n != esperadas {
			t.Fatalf("%s: el ADD CONSTRAINT corrió %d veces en total, se esperaban %d", motivo, n, esperadas)
		}
	}

	correr(paso(10), 1, "primera vez")
	correr(paso(10), 1, "misma huella y objeto presente: no tiene que correr")
	correr(paso(20), 2, "cambió el SQL: tiene que volver a correr")
	correr(paso(20), 2, "la nueva huella ya está guardada")

	// El objeto se borra a mano: la huella coincide, pero hay que recrearlo.
	if err := tx.Exec(`ALTER TABLE t_huella_prueba DROP CONSTRAINT chk_t_huella`).Error; err != nil {
		t.Fatal(err)
	}
	correr(paso(20), 3, "el objeto no existe: tiene que recrearse aunque la huella coincida")
	var existe bool
	if err := tx.Raw(`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_t_huella')`).Scan(&existe).Error; err != nil || !existe {
		t.Fatalf("la constraint tendría que existir de nuevo (err=%v)", err)
	}
}

func TestAplicarSiHaceFalta_SoloEjecutaConElObjetoAusente(t *testing.T) {
	tx, corridas := tablaDeHuellaDePrueba(t, "ADD COLUMN IF NOT EXISTS extra_prueba")
	paso := agregarColumnaSiFalta("t_huella_prueba", "extra_prueba",
		`ALTER TABLE t_huella_prueba ADD COLUMN IF NOT EXISTS extra_prueba int`)

	if err := aplicarSiHaceFalta(tx, paso); err != nil {
		t.Fatal(err)
	}
	if n := corridas(); n != 1 {
		t.Fatalf("con la columna ausente tenía que ejecutar el ALTER una vez, corrió %d", n)
	}
	if err := aplicarSiHaceFalta(tx, paso); err != nil {
		t.Fatal(err)
	}
	if n := corridas(); n != 1 {
		t.Fatalf("con la columna presente no tenía que ejecutar nada, corrió %d veces en total", n)
	}
}
