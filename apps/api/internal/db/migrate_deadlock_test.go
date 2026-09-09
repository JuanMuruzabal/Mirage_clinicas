package db

import (
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Reintento de migraciones ante deadlock — ver el comentario grande de
// RunMigrations en migrate.go. Bug real de CI (2026-09-09):
//
//	migrate.go:368 ERROR: deadlock detected (SQLSTATE 40P01)
//	DROP INDEX IF EXISTS idx_paciente_dni_unico
//
// El advisory lock serializa las migraciones ENTRE SÍ, pero no contra las
// transacciones comunes que corran al mismo tiempo contra la misma base.
//
// Este archivo es `package db` (no `db_test` como el resto de los tests de
// este paquete) porque prueba dos funciones sin exportar. Por eso también
// abre su propia conexión en vez de usar `internal/testdb`: ese paquete
// importa a `db`, así que un test interno que lo importara armaría un
// ciclo de imports.

// conexionDePrueba — misma DSN que usa internal/testdb. Se saltea el test
// si no hay Postgres a mano, en vez de fallar: estos tests no aportan nada
// que justifique romper una corrida en una máquina sin la base levantada.
func conexionDePrueba(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://dental_mirage:dental_mirage@localhost:5432/dental_mirage_test?sslmode=disable"
	}
	gdb, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		// Silencioso a propósito: estos tests PROVOCAN un deadlock, y el
		// logger por default lo imprime como si fuera una falla real.
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Skipf("no hay base de test disponible (%v) — se saltea", err)
	}
	sqlDB, err := gdb.DB()
	if err != nil {
		t.Skipf("no se pudo obtener *sql.DB (%v) — se saltea", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("no hay base de test disponible (%v) — se saltea", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	return gdb
}

// provocarDeadlockReal arma el deadlock de manual: dos transacciones que
// toman dos locks en orden opuesto. Usa advisory locks y no filas de una
// tabla porque no necesita esquema, no ensucia nada y no deja nada que
// limpiar — para Postgres es un deadlock igual de real (SQLSTATE 40P01),
// que es lo único que este test necesita.
//
// Devuelve el error de la transacción que Postgres eligió como víctima.
func provocarDeadlockReal(t *testing.T, gdb *gorm.DB) error {
	t.Helper()

	const claveA, claveB = 918273641, 918273642
	// Barrera de dos partes: cada transacción avisa que ya tomó SU lock y
	// espera a que la otra haya hecho lo mismo antes de pedir el segundo.
	// Sin esto, la primera podría tomar sus dos locks y terminar antes de
	// que la otra arranque, y no habría ciclo.
	var ambasTomaronElPrimero sync.WaitGroup
	ambasTomaronElPrimero.Add(2)

	errores := make(chan error, 2)
	var wg sync.WaitGroup

	cruzar := func(primero, segundo int) {
		defer wg.Done()
		errores <- gdb.Transaction(func(tx *gorm.DB) error {
			if err := tx.Exec("SELECT pg_advisory_xact_lock(?)", primero).Error; err != nil {
				ambasTomaronElPrimero.Done()
				return err
			}
			ambasTomaronElPrimero.Done()
			ambasTomaronElPrimero.Wait()
			return tx.Exec("SELECT pg_advisory_xact_lock(?)", segundo).Error
		})
	}

	wg.Add(2)
	go cruzar(claveA, claveB)
	go cruzar(claveB, claveA)
	wg.Wait()
	close(errores)

	for err := range errores {
		if err != nil {
			return err
		}
	}
	return nil
}

// TestEsDeadlock_ReconoceUnDeadlockRealDePostgres — el test que de verdad
// importa de este archivo, y la razón por la que provoca un deadlock DE
// VERDAD en vez de fabricar un *pgconn.PgError a mano: lo único que puede
// fallar en silencio acá es el desenvuelto del error. Entre el "deadlock
// detected" de Postgres y el `error` que devuelve GORM hay dos capas
// (pgx/stdlib y el propio GORM); si alguna envolviera el error de una
// forma que `errors.As` no atraviesa, esDeadlock devolvería false siempre,
// el reintento no se dispararía nunca, y no habría ningún síntoma visible
// hasta el próximo CI rojo.
func TestEsDeadlock_ReconoceUnDeadlockRealDePostgres(t *testing.T) {
	gdb := conexionDePrueba(t)

	err := provocarDeadlockReal(t, gdb)
	if err == nil {
		t.Fatal("no se produjo el deadlock esperado entre las dos transacciones")
	}
	if !esDeadlock(err) {
		t.Fatalf("esDeadlock no reconoció un deadlock REAL de Postgres — el error de la base no sobrevive "+
			"el desenvuelto de GORM/pgx: %v", err)
	}
}

// TestEsDeadlock_NoConfundeOtrosErrores — el otro lado: reintentar un error
// que no es un deadlock solo agrega segundos de espera antes de la misma
// falla.
func TestEsDeadlock_NoConfundeOtrosErrores(t *testing.T) {
	if esDeadlock(nil) {
		t.Error("nil no es un deadlock")
	}
	if esDeadlock(gorm.ErrRecordNotFound) {
		t.Error("ErrRecordNotFound no es un deadlock")
	}
	// El caso que justifica chequear el SQLSTATE y no el mensaje.
	if esDeadlock(errors.New("ERROR: deadlock detected (SQLSTATE 40P01)")) {
		t.Error("un error cualquiera que MENCIONE un deadlock no es un deadlock de Postgres")
	}

	// Un error real de Postgres, pero de otra clase: confirma que esDeadlock
	// mira el código y no simplemente si el error vino de la base.
	gdb := conexionDePrueba(t)
	err := gdb.Exec("SELECT * FROM una_tabla_que_no_existe_en_ningun_esquema").Error
	if err == nil {
		t.Fatal("esperaba que consultar una tabla inexistente fallara")
	}
	if esDeadlock(err) {
		t.Errorf("un 'relation does not exist' no es un deadlock: %v", err)
	}
}

// TestConReintentoPorDeadlock — el bucle en sí. Recibe los parámetros de
// reintento justamente para poder ejercitarlo sin dormir segundos reales.
func TestConReintentoPorDeadlock(t *testing.T) {
	gdb := conexionDePrueba(t)
	deadlock := provocarDeadlockReal(t, gdb)
	if deadlock == nil || !esDeadlock(deadlock) {
		t.Fatalf("no se pudo capturar un deadlock real para los subtests: %v", deadlock)
	}

	t.Run("reintenta hasta que deja de dar deadlock", func(t *testing.T) {
		llamadas := 0
		err := conReintentoPorDeadlock(5, time.Millisecond, func() error {
			llamadas++
			if llamadas < 3 {
				return deadlock
			}
			return nil
		})
		if err != nil {
			t.Fatalf("esperaba éxito en el tercer intento, dio: %v", err)
		}
		if llamadas != 3 {
			t.Errorf("llamó %d veces, esperaba 3", llamadas)
		}
	})

	t.Run("se rinde tras agotar los intentos, sin perder el error original", func(t *testing.T) {
		llamadas := 0
		err := conReintentoPorDeadlock(4, time.Millisecond, func() error {
			llamadas++
			return deadlock
		})
		if err == nil {
			t.Fatal("esperaba un error tras agotar los intentos")
		}
		if llamadas != 4 {
			t.Errorf("llamó %d veces, esperaba 4", llamadas)
		}
		// Sigue siendo reconocible como deadlock: quien lea el log tiene
		// que poder distinguir "se agotaron los reintentos" de "la
		// migración falló por otra cosa".
		if !esDeadlock(err) {
			t.Errorf("el error devuelto tiene que seguir envolviendo al deadlock original: %v", err)
		}
	})

	t.Run("un error que no es deadlock no se reintenta", func(t *testing.T) {
		llamadas := 0
		propio := errors.New("la migración X falló de verdad")
		// Espera de 1 segundo a propósito: si esto reintentara, el test
		// tardaría segundos en vez de milisegundos.
		err := conReintentoPorDeadlock(5, time.Second, func() error {
			llamadas++
			return propio
		})
		if !errors.Is(err, propio) {
			t.Errorf("esperaba el error tal cual, dio: %v", err)
		}
		if llamadas != 1 {
			t.Errorf("llamó %d veces, esperaba 1 — reintentar un error real solo agrega espera", llamadas)
		}
	})
}
