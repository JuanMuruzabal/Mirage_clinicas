// Package testdb da a los tests de apps/api una base de Postgres real y
// aislada, en vez de mockear la capa de datos (TR-007 en
// docs/tradeoffs.md: el gate de coverage 80% está activo desde Sprint 0, y
// el exclusion constraint de turnos no se puede simular con sentido de
// otra forma que contra Postgres real — mismo criterio que TR-038 de
// Marcuzzi_Madryn).
package testdb

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // registra el driver "pgx" para database/sql
	"gorm.io/gorm"

	"dental-mirage/api/internal/db"
)

// Default apuntado a un Postgres local (el mismo docker-compose.yml de la
// raíz del repo) — una base DISTINTA de la de desarrollo. En CI,
// TEST_DATABASE_URL la pisa con el service container de Postgres.
const defaultTestDSN = "postgres://dental_mirage:dental_mirage@localhost:5432/dental_mirage_test?sslmode=disable"

var (
	once     sync.Once
	shared   *gorm.DB
	setupErr error
)

// New conecta (una sola vez por proceso de test) a la base de test, la
// migra si hace falta, y devuelve una transacción nueva que se revierte
// sola cuando el test termina (`t.Cleanup`) — cada test queda aislado de
// los demás sin recrear el esquema en cada uno.
func New(t *testing.T) *gorm.DB {
	t.Helper()

	once.Do(func() {
		shared, setupErr = setup()
	})
	if setupErr != nil {
		t.Fatalf("testdb: %v", setupErr)
	}

	tx := shared.Begin()
	if tx.Error != nil {
		t.Fatalf("testdb: no se pudo abrir una transacción: %v", tx.Error)
	}
	t.Cleanup(func() {
		if err := tx.Rollback().Error; err != nil {
			t.Logf("testdb: rollback falló (no debería importarle al test): %v", err)
		}
	})
	return tx
}

// Shared devuelve la conexión de test real (NO envuelta en una transacción
// que se revierte sola) — solo para tests que necesitan escrituras
// comprometidas, visibles entre sí desde transacciones/goroutines
// distintas (p. ej. el test de concurrencia real del exclusion constraint
// de turnos). El test es responsable de limpiar lo que crea acá.
func Shared(t *testing.T) *gorm.DB {
	t.Helper()
	once.Do(func() {
		shared, setupErr = setup()
	})
	if setupErr != nil {
		t.Fatalf("testdb: %v", setupErr)
	}
	return shared
}

func setup() (*gorm.DB, error) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = defaultTestDSN
	}

	dbName, err := requireTestDatabaseName(dsn)
	if err != nil {
		return nil, err
	}

	if err := ensureDatabaseExists(dsn, dbName); err != nil {
		return nil, fmt.Errorf("no se pudo asegurar que exista la base de test %q: %w", dbName, err)
	}

	gdb, err := db.Connect(dsn)
	if err != nil {
		return nil, fmt.Errorf("no se pudo conectar a la base de test: %w", err)
	}

	// `go test ./...` corre el binario de cada paquete en paralelo por
	// default — un pool chico acá evita agotar max_connections cuando
	// varios paquetes de test corren a la vez (mismo ajuste que
	// Marcuzzi_Madryn, ver su internal/testdb).
	sqlDB, err := gdb.DB()
	if err != nil {
		return nil, fmt.Errorf("no se pudo obtener *sql.DB de la conexión de test: %w", err)
	}
	sqlDB.SetMaxOpenConns(5)

	if err := db.RunMigrations(gdb); err != nil {
		return nil, fmt.Errorf("no se pudo migrar la base de test: %w", err)
	}
	return gdb, nil
}

// requireTestDatabaseName es la red de seguridad de TR-007/spec §9.6:
// nunca debe ser posible que la suite de tests corra por accidente contra
// la base de desarrollo o producción.
func requireTestDatabaseName(dsn string) (string, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return "", fmt.Errorf("TEST_DATABASE_URL inválida: %w", err)
	}
	name := strings.TrimPrefix(u.Path, "/")
	if !strings.HasSuffix(name, "_test") {
		return "", fmt.Errorf(
			"la base de datos de test (%q, de TEST_DATABASE_URL) tiene que terminar en \"_test\" — "+
				"nunca corras los tests contra la base de desarrollo o producción", name)
	}
	return name, nil
}

// ensureDatabaseExists crea la base de test si todavía no existe —
// CREATE DATABASE no se puede correr dentro de una transacción ni contra
// la conexión a la base que se está por crear, así que esto conecta aparte
// a la base de mantenimiento "postgres" del mismo servidor.
func ensureDatabaseExists(dsn, dbName string) error {
	u, err := url.Parse(dsn)
	if err != nil {
		return err
	}
	u.Path = "/postgres"
	maint, err := sql.Open("pgx", u.String())
	if err != nil {
		return err
	}
	defer func() { _ = maint.Close() }()

	var exists bool
	err = maint.QueryRow(`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)`, dbName).Scan(&exists)
	if err != nil {
		return fmt.Errorf("no se pudo consultar pg_database (¿Postgres está corriendo? ver docker-compose.yml): %w", err)
	}
	if exists {
		return nil
	}

	// El nombre no puede parametrizarse en CREATE DATABASE — ya se validó
	// arriba que termina en "_test" y viene de una variable de entorno de
	// confianza del propio entorno de test, no de input de usuario.
	if _, err := maint.Exec(fmt.Sprintf(`CREATE DATABASE %q`, dbName)); err != nil {
		return fmt.Errorf("no se pudo crear la base de test: %w", err)
	}
	return nil
}
