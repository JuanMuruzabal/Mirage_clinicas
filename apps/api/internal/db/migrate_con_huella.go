package db

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"gorm.io/gorm"
)

// Pasos de migración que REEMPLAZAN algo que ya existe (un check que cambió
// de valores, un trigger, un índice con otro predicado) y que, por eso, se
// escribieron como DROP + ADD o CREATE OR REPLACE: idempotentes en su
// RESULTADO, pero no en sus LOCKS.
//
// Bug real de CI (PR #83, 2026-10-01):
//
//	paciente_verificado_publico.go:86 ERROR: deadlock detected (SQLSTATE 40P01)
//	(un SELECT sobre documentos_clinicos, dentro de un GET /turnos de un test)
//
// `go test ./internal/...` corre los paquetes en paralelo contra la misma
// base, y cada paquete migra por su cuenta. El advisory lock de
// RunMigrations serializa las migraciones ENTRE SÍ, pero no contra los
// tests de otro paquete que ya migró y está corriendo: cada test vive en
// una transacción revertida que va juntando locks sobre lo que lee. Y la
// migración volvía a ejecutar, en CADA corrida y aunque no hubiera nada que
// cambiar, sentencias que toman locks fuertes: un `DROP CONSTRAINT` + `ADD
// CONSTRAINT` toma ACCESS EXCLUSIVE sobre la tabla, un `CREATE OR REPLACE
// TRIGGER` toma SHARE ROW EXCLUSIVE, un `DROP INDEX` toma ACCESS EXCLUSIVE
// sobre la tabla del índice. La migración se queda con una tabla y espera
// otra que el test ya leyó; el test espera la que tomó la migración —
// ciclo, y Postgres mata a uno de los dos, a veces al test. El reintento
// por deadlock de RunMigrations solo salva el caso en que la víctima es la
// migración.
//
// Lo mismo puede pasar en producción: el contenedor `migrate` de un deploy
// corre mientras la instancia anterior de la API sigue atendiendo.
//
// La salida no es reintentar mejor sino NO TOMAR el lock cuando no hace
// falta: cada uno de estos pasos guarda la huella (sha256) de su SQL en
// `migraciones_por_huella`, y la próxima corrida lo saltea entero si la
// huella es la misma Y el objeto que crea sigue existiendo. Las dos
// condiciones importan:
//
//   - Si el SQL cambió (un estado nuevo en un check, un tema nuevo en el
//     catálogo), la huella es otra y el paso corre UNA vez — que es para lo
//     que existía el DROP + ADD: GORM no actualiza un check que ya existe.
//   - Si alguien borró el objeto a mano (o un test lo afloja para plantar un
//     dato viejo), la huella guardada no alcanza: el paso vuelve a correr.
//
// Preguntar si existe consulta el catálogo (pg_constraint, pg_trigger,
// to_regclass), que no toma ningún lock sobre la tabla — mismo criterio que
// agregarForeignKey en migrate_fk.go, que resolvió el mismo problema para
// las foreign keys.
//
// Una base que ya existía (producción, la de Docker) no tiene ninguna
// huella guardada la primera vez: cada paso corre una vez, como hasta hoy,
// y desde ahí queda en silencio. No hace falta una migración especial.
//
// Lo que NO va acá: `CREATE OR REPLACE FUNCTION` no toma locks de tabla, y
// sigue corriendo en cada arranque como sentencia común.

// pasoConHuella describe un paso que solo corre si cambió o si falta.
type pasoConHuella struct {
	// nombre es la clave en migraciones_por_huella: el nombre del objeto que
	// el paso crea (la constraint, el trigger, el índice). NUNCA cambiarlo
	// una vez deployado sin pensar: un nombre nuevo no tiene huella y el
	// paso corre otra vez (inofensivo, pero toma el lock).
	nombre string
	// existe es un SELECT que devuelve un único bool: si el objeto está en
	// la base. Tiene que consultar el catálogo, no la tabla — una consulta
	// que tome lock sobre la tabla reintroduce el problema.
	existe string
	// sentencias corren en orden, dentro de la transacción de la migración.
	sentencias []string
}

// crearTablaDeHuellas — SQL crudo y no AutoMigrate porque la tabla es solo
// de control, sin modelo que la use desde la aplicación. CREATE TABLE IF
// NOT EXISTS sobre una tabla ya creada no toma lock sobre ninguna otra.
func crearTablaDeHuellas(tx *gorm.DB) error {
	if err := tx.Exec(`CREATE TABLE IF NOT EXISTS migraciones_por_huella (
		nombre      text PRIMARY KEY,
		huella      char(64) NOT NULL,
		aplicada_en timestamptz NOT NULL DEFAULT now()
	)`).Error; err != nil {
		return fmt.Errorf("no se pudo crear migraciones_por_huella: %w", err)
	}
	return nil
}

// huellaDe — sha256 en hex de las sentencias. El separador es un byte que
// no aparece en SQL, para que ["a", "bc"] y ["ab", "c"] no den lo mismo.
func huellaDe(sentencias []string) string {
	suma := sha256.Sum256([]byte(strings.Join(sentencias, "\x00")))
	return hex.EncodeToString(suma[:])
}

// aplicarSiCambio corre el paso solo si su huella cambió o si el objeto no
// existe; en el caso de siempre (nada cambió) no ejecuta ningún ALTER ni
// CREATE. Si corre, guarda la huella en la MISMA transacción: si una
// sentencia falla, la huella vieja queda como estaba y el próximo arranque
// lo vuelve a intentar.
func aplicarSiCambio(tx *gorm.DB, p pasoConHuella) error {
	huella := huellaDe(p.sentencias)

	var guardada string
	if err := tx.Raw(
		`SELECT COALESCE((SELECT huella FROM migraciones_por_huella WHERE nombre = ?), '')`,
		p.nombre).Scan(&guardada).Error; err != nil {
		return fmt.Errorf("no se pudo leer la huella de %s: %w", p.nombre, err)
	}

	if guardada == huella {
		var existe bool
		if err := tx.Raw(p.existe).Scan(&existe).Error; err != nil {
			return fmt.Errorf("no se pudo verificar si existe %s: %w", p.nombre, err)
		}
		if existe {
			return nil
		}
	}

	for _, stmt := range p.sentencias {
		if err := tx.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migración %s falló (%s): %w", p.nombre, stmt, err)
		}
	}

	if err := tx.Exec(`INSERT INTO migraciones_por_huella (nombre, huella, aplicada_en)
		VALUES (?, ?, now())
		ON CONFLICT (nombre) DO UPDATE SET huella = EXCLUDED.huella, aplicada_en = EXCLUDED.aplicada_en`,
		p.nombre, huella).Error; err != nil {
		return fmt.Errorf("no se pudo guardar la huella de %s: %w", p.nombre, err)
	}
	return nil
}

// aplicarPasosCrudos ejecuta, EN ORDEN, una lista que mezcla sentencias
// comunes (string: corren siempre), pasos con huella (pasoConHuella) y
// pasos que solo corren si el catálogo dice que hacen falta
// (pasoSiHaceFalta, más abajo). Es una sola lista y
// no dos porque el orden importa — un check que depende de que antes se
// haya migrado un dato, un trigger que necesita su función — y separarlas
// obligaría a correr todas las de un tipo antes que las del otro.
func aplicarPasosCrudos(tx *gorm.DB, pasos []any) error {
	for _, paso := range pasos {
		switch p := paso.(type) {
		case string:
			if err := tx.Exec(p).Error; err != nil {
				return fmt.Errorf("migración cruda falló (%s): %w", p, err)
			}
		case pasoConHuella:
			if err := aplicarSiCambio(tx, p); err != nil {
				return err
			}
		case pasoSiHaceFalta:
			if err := aplicarSiHaceFalta(tx, p); err != nil {
				return err
			}
		default:
			return fmt.Errorf("paso de migración de tipo inesperado %T", paso)
		}
	}
	return nil
}

// reemplazarConstraint — el paso de siempre para un check (o un EXCLUDE)
// cuya definición puede cambiar: DROP IF EXISTS + ADD, solo cuando cambió.
func reemplazarConstraint(tabla, nombre string, sentencias ...string) pasoConHuella {
	return pasoConHuella{
		nombre: nombre,
		existe: fmt.Sprintf(
			`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = %s AND conrelid = to_regclass(%s))`,
			literalSQL(nombre), literalSQL(tabla)),
		sentencias: sentencias,
	}
}

// reemplazarTrigger — un CREATE OR REPLACE TRIGGER, solo cuando cambió.
func reemplazarTrigger(tabla, nombre, sentencia string) pasoConHuella {
	return pasoConHuella{
		nombre: nombre,
		existe: fmt.Sprintf(
			`SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = %s AND tgrelid = to_regclass(%s))`,
			literalSQL(nombre), literalSQL(tabla)),
		sentencias: []string{sentencia},
	}
}

// reemplazarIndice — un DROP INDEX + CREATE INDEX (un índice cuyo predicado
// o columnas cambiaron), solo cuando cambió.
func reemplazarIndice(nombre string, sentencias ...string) pasoConHuella {
	return pasoConHuella{
		nombre:     nombre,
		existe:     fmt.Sprintf(`SELECT to_regclass(%s) IS NOT NULL`, literalSQL(nombre)),
		sentencias: sentencias,
	}
}

// --- Pasos "solo si hace falta" (sin huella) ---
//
// La otra mitad del mismo problema. Las sentencias que CREAN algo una sola
// vez —`ADD CONSTRAINT` dentro de un `DO … EXCEPTION WHEN duplicate_object`,
// `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`— y las que fijan
// una propiedad de columna (`SET DEFAULT`, `DROP NOT NULL`) son idempotentes
// en su resultado, pero Postgres toma el lock de la tabla ANTES de descubrir
// que no hay nada que hacer:
//
//   - `ALTER TABLE` (ADD CONSTRAINT, ADD COLUMN, ALTER COLUMN): ACCESS
//     EXCLUSIVE, el que choca hasta con un SELECT. Dentro de un `DO …
//     EXCEPTION` el lock se suelta al abortar la subtransacción, así que no
//     aparece en pg_locks al final — pero se ESPERÓ igual, que es lo que
//     arma el ciclo del deadlock.
//   - `CREATE INDEX IF NOT EXISTS`: SHARE sobre la tabla, que frena todo
//     INSERT/UPDATE/DELETE de los tests de otros paquetes.
//   - `VALIDATE CONSTRAINT`: SHARE UPDATE EXCLUSIVE, y además recorre la
//     tabla entera aunque la constraint ya esté validada.
//
// Estas no necesitan huella: la sentencia no cambia nunca (si cambiara, el
// patrón correcto es reemplazarConstraint/reemplazarIndice). Alcanza con
// preguntarle al catálogo si el objeto ya está como tiene que estar —mismo
// criterio que agregarForeignKey en migrate_fk.go— y no ejecutar nada si
// lo está. La sentencia original se conserva tal cual (con su `IF NOT
// EXISTS` o su `EXCEPTION`): si dos procesos migraran sin el advisory lock,
// el segundo seguiría sin fallar.

// pasoSiHaceFalta describe una sentencia que solo corre si el catálogo dice
// que hace falta.
type pasoSiHaceFalta struct {
	// nombre — para el mensaje de error; no se guarda en ningún lado.
	nombre string
	// haceFalta es un SELECT que devuelve un único bool: true si hay que
	// correr las sentencias. Consulta el catálogo (pg_constraint,
	// pg_attribute, pg_attrdef, to_regclass), nunca la tabla.
	haceFalta string
	// sentencias corren en orden, dentro de la transacción de la migración.
	sentencias []string
}

// aplicarSiHaceFalta pregunta y, solo si hace falta, ejecuta.
func aplicarSiHaceFalta(tx *gorm.DB, p pasoSiHaceFalta) error {
	var hayQueCorrer bool
	if err := tx.Raw(p.haceFalta).Scan(&hayQueCorrer).Error; err != nil {
		return fmt.Errorf("no se pudo verificar si hace falta %s: %w", p.nombre, err)
	}
	if !hayQueCorrer {
		return nil
	}
	for _, stmt := range p.sentencias {
		if err := tx.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migración %s falló (%s): %w", p.nombre, stmt, err)
		}
	}
	return nil
}

// existeConstraintSQL — el SELECT de "¿existe esta constraint en esta
// tabla?". Por conname + conrelid, no solo por nombre: un nombre de
// constraint es único por tabla, no en todo el esquema.
func existeConstraintSQL(tabla, nombre string) string {
	return fmt.Sprintf(
		`SELECT 1 FROM pg_constraint WHERE conname = %s AND conrelid = to_regclass(%s)`,
		literalSQL(nombre), literalSQL(tabla))
}

// crearConstraintSiFalta — un `ADD CONSTRAINT` que se crea una vez y nunca
// cambia (el viejo `DO … EXCEPTION WHEN duplicate_object`).
func crearConstraintSiFalta(tabla, nombre, sentencia string) pasoSiHaceFalta {
	return pasoSiHaceFalta{
		nombre:     nombre,
		haceFalta:  `SELECT NOT EXISTS (` + existeConstraintSQL(tabla, nombre) + `)`,
		sentencias: []string{sentencia},
	}
}

// validarConstraintSiFalta — un `VALIDATE CONSTRAINT` que solo corre si la
// constraint existe y todavía no está validada (pg_constraint.convalidated).
// Si la validación ya pasó una vez, no hay nada más que validar: desde ahí
// Postgres la hace cumplir en toda fila nueva o modificada.
func validarConstraintSiFalta(tabla, nombre, sentencia string) pasoSiHaceFalta {
	return pasoSiHaceFalta{
		nombre:     "validar " + nombre,
		haceFalta:  `SELECT EXISTS (` + existeConstraintSQL(tabla, nombre) + ` AND NOT convalidated)`,
		sentencias: []string{sentencia},
	}
}

// crearIndiceSiFalta — un `CREATE [UNIQUE] INDEX IF NOT EXISTS`, preguntando
// antes con to_regclass (que no toma lock). Mismo criterio de existencia
// que el `IF NOT EXISTS`: el nombre, no la definición.
func crearIndiceSiFalta(nombre, sentencia string) pasoSiHaceFalta {
	return pasoSiHaceFalta{
		nombre:     nombre,
		haceFalta:  fmt.Sprintf(`SELECT to_regclass(%s) IS NULL`, literalSQL(nombre)),
		sentencias: []string{sentencia},
	}
}

// borrarIndiceSiExiste — un `DROP INDEX IF EXISTS` de un índice viejo: solo
// corre si el índice sigue ahí.
func borrarIndiceSiExiste(nombre, sentencia string) pasoSiHaceFalta {
	return pasoSiHaceFalta{
		nombre:     "borrar " + nombre,
		haceFalta:  fmt.Sprintf(`SELECT to_regclass(%s) IS NOT NULL`, literalSQL(nombre)),
		sentencias: []string{sentencia},
	}
}

// columnaSQL — el filtro de pg_attribute para una columna viva de una tabla.
func columnaSQL(tabla, columna string) string {
	return fmt.Sprintf(`attrelid = to_regclass(%s) AND attname = %s AND NOT attisdropped`,
		literalSQL(tabla), literalSQL(columna))
}

// agregarColumnaSiFalta — un `ADD COLUMN IF NOT EXISTS`. Mismo criterio que
// el `IF NOT EXISTS`: si la columna existe no se mira su definición.
func agregarColumnaSiFalta(tabla, columna, sentencia string) pasoSiHaceFalta {
	return pasoSiHaceFalta{
		nombre:     tabla + "." + columna,
		haceFalta:  `SELECT NOT EXISTS (SELECT 1 FROM pg_attribute WHERE ` + columnaSQL(tabla, columna) + `)`,
		sentencias: []string{sentencia},
	}
}

// quitarNotNullSiHaceFalta — un `ALTER COLUMN … DROP NOT NULL`, solo si la
// columna todavía es NOT NULL (pg_attribute.attnotnull).
func quitarNotNullSiHaceFalta(tabla, columna, sentencia string) pasoSiHaceFalta {
	return pasoSiHaceFalta{
		nombre:     tabla + "." + columna + " sin NOT NULL",
		haceFalta:  `SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE ` + columnaSQL(tabla, columna) + ` AND attnotnull)`,
		sentencias: []string{sentencia},
	}
}

// fijarDefaultSiDistinto — un `ALTER COLUMN … SET DEFAULT`, solo si el
// default actual no es `defaultEsperado`.
//
// `defaultEsperado` es el texto que devuelve pg_get_expr, que NO es el que
// se escribió: Postgres lo normaliza con el tipo de la columna (`SET DEFAULT
// 'agendado'` sobre un varchar queda `'agendado'::character varying`). Se
// compara contra lo que Postgres devuelve de verdad, medido en la base de
// test. Si la comparación fallara (otra versión de Postgres lo escribiera
// distinto, o la columna cambiara de tipo), el costo es solo que el ALTER
// vuelve a correr como antes de este cambio — nunca un default equivocado.
func fijarDefaultSiDistinto(tabla, columna, defaultEsperado, sentencia string) pasoSiHaceFalta {
	return pasoSiHaceFalta{
		nombre: tabla + "." + columna + " default",
		haceFalta: fmt.Sprintf(`SELECT NOT EXISTS (
			SELECT 1 FROM pg_attribute a
			JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
			WHERE %s AND pg_get_expr(d.adbin, d.adrelid) = %s)`,
			columnaSQL(tabla, columna), literalSQL(defaultEsperado)),
		sentencias: []string{sentencia},
	}
}

// literalSQL — un literal de texto de SQL. Los nombres que recibe son
// constantes del código, nunca datos de afuera; se escapa igual.
func literalSQL(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
