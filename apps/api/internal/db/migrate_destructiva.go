package db

import (
	"fmt"
	"log/slog"

	"gorm.io/gorm"
)

// Migraciones DESTRUCTIVAS — Fase C de la auditoría de seguridad y
// optimización (2026-09-09, `docs/Seguridad y optimizacion/`), ítem
// "cortar de raíz las migraciones destructivas sin backup".
//
// El problema que resuelve este archivo: `migrate.go` tenía repartidos, en
// la misma lista que las migraciones de esquema inofensivas, un
// `DELETE FROM turnos`, cinco `DROP COLUMN` sobre `pacientes`, dos más
// sobre `paciente_tutores`/`turnos` y un `DROP TABLE`. Todos corriendo
// AUTOMÁTICAMENTE en cada arranque del contenedor `migrate`, sin dejar
// registro de que corrieron y sin que nadie tuviera que aprobar nada. En un
// proyecto sin producción todavía eso era aceptable; con datos reales de
// una clínica adentro, no: un `DROP COLUMN IF EXISTS` no avisa, no falla y
// no se puede deshacer.
//
// La regla que impone este archivo: **una migración que destruye datos no
// corre en un entorno que no sea `development` sin que alguien lo habilite
// explícitamente para ESE deploy.**
//
// El matiz que hace que la regla no moleste todos los días: el permiso se
// pide SOLO si de verdad hay algo que perder. Cada migración declara cómo
// contar qué destruiría; si la cuenta da cero —una base nueva, o una que ya
// pasó por esta migración— se registra como aplicada y se sigue de largo
// sin pedirle nada a nadie. Una barrera que se dispara cuando no hace falta
// se termina desactivando "para que el deploy pase", y ahí deja de proteger.

// PoliticaDestructiva decide si una migración que destruye datos puede
// correr. Se resuelve UNA SOLA VEZ, en `cmd/migrate/main.go`, a partir de
// la Config ya cargada — no leyendo variables de entorno desde acá. Es la
// lección de TR-125: dos lugares distintos decidiendo "¿estamos en
// producción?" con criterios propios terminan discrepando, y el hueco entre
// los dos es exactamente donde vive el bug.
type PoliticaDestructiva struct {
	// Permitir habilita las migraciones destructivas que tengan algo que
	// destruir. En `development` es true; fuera de ahí, solo si alguien
	// puso DB_ALLOW_DESTRUCTIVE=true a conciencia para ese deploy.
	Permitir bool
	// Entorno se usa solo para el mensaje de error, para que quien lo lea
	// entienda por qué se frenó.
	Entorno string
}

// MigracionDestructiva describe una migración que borra datos de forma
// irreversible.
type MigracionDestructiva struct {
	// Nombre — clave estable en `migraciones_una_vez`. NUNCA cambiarlo una
	// vez deployado: es lo que decide si ya corrió.
	Nombre string
	// Descripcion — qué destruye, en castellano, para el log y para el
	// mensaje de error. Lo lee una persona a la que se le acaba de frenar
	// un deploy: tiene que alcanzarle para decidir sin abrir el código.
	Descripcion string
	// Afectados cuenta cuánto se perdería si esta migración corre AHORA.
	//
	// CONTRATO: si Afectados devuelve 0, Aplicar tiene que ser un no-op —
	// y por eso, cuando da 0, Aplicar directamente NO se llama. No es una
	// optimización: las migraciones previas al AutoMigrate se pueden
	// encontrar con una base recién creada donde la tabla ni existe, y ahí
	// hasta un `DELETE FROM tabla` inofensivo falla (y, peor, aborta la
	// transacción entera). Contar 0 significa "no hay nada que hacer acá",
	// no solo "no hay nada que perder".
	Afectados func(tx *gorm.DB) (int64, error)
	// Aplicar hace el trabajo. Corre dentro de la misma transacción que el
	// registro en `migraciones_una_vez`: o pasan las dos cosas, o ninguna.
	// Solo se llama si Afectados devolvió más de 0 — ver el contrato de
	// arriba.
	Aplicar func(tx *gorm.DB) error
}

// aplicarDestructivaUnaVez es el guardián. Ver el comentario grande de
// arriba para el porqué de cada paso.
//
// Corre dentro de RunMigrations, que ya tomó el advisory lock — no hace
// falta un lock propio.
func aplicarDestructivaUnaVez(gdb *gorm.DB, pol PoliticaDestructiva, m MigracionDestructiva) error {
	aplicada, err := migracionYaAplicada(gdb, m.Nombre)
	if err != nil {
		return err
	}
	if aplicada {
		return nil
	}

	afectados, err := m.Afectados(gdb)
	if err != nil {
		return fmt.Errorf("no se pudo evaluar el impacto de la migración destructiva %q: %w", m.Nombre, err)
	}

	if afectados == 0 {
		// Nada que destruir: no se ejecuta Aplicar (ver el contrato en
		// MigracionDestructiva.Afectados) pero se registra igual, para no
		// volver a evaluarlo en cada arranque y para dejar asentado que
		// este esquema ya pasó por acá.
		return registrarMigracion(gdb, m.Nombre, func(*gorm.DB) error { return nil })
	}

	if !pol.Permitir {
		return fmt.Errorf(
			"migración destructiva %q FRENADA en el entorno %q: destruiría %d elemento(s) — %s.\n"+
				"Hacé un backup de la base ANTES de seguir. Con el backup hecho, volvé a correr este "+
				"contenedor con DB_ALLOW_DESTRUCTIVE=true para autorizarla solo en esta corrida",
			m.Nombre, pol.Entorno, afectados, m.Descripcion)
	}

	slog.Warn("aplicando migración destructiva autorizada",
		"migracion", m.Nombre,
		"afectados", afectados,
		"descripcion", m.Descripcion,
		"entorno", pol.Entorno,
	)
	return registrarMigracion(gdb, m.Nombre, m.Aplicar)
}

// migracionesDestructivasPosteriores — las que pueden correr DESPUÉS del
// AutoMigrate, porque solo tocan datos o columnas que el esquema nuevo ya
// no declara.
//
// EL ORDEN IMPORTA y es el mismo motivo por el que este bloque va antes del
// loop de `statements` en migrate.go (bug real, 2026-09-08): la
// deduplicación existe para que `CREATE UNIQUE INDEX idx_paciente_dni_unico`
// no falle, y el borrado de turnos `pendiente` para que el check constraint
// estrechado a ('agendado','cancelada') no rechace filas viejas. Las dos
// cosas viven en ese loop.
func migracionesDestructivasPosteriores() []MigracionDestructiva {
	return []MigracionDestructiva{
		{
			Nombre:      migracionDedupPacientesDNI,
			Descripcion: "fichas de paciente duplicadas por (profesional_id, dni): se conserva la más vieja, sus turnos se reasignan a esa, y el resto se borra",
			Afectados:   contarPacientesDuplicados,
			Aplicar:     dedupPacientesPorDNI,
		},
		{
			// Fase 2.4.2: las 5 columnas Tutor* de `pacientes` pasaron a la
			// tabla PacienteTutor (uno-a-muchos). GORM AutoMigrate nunca
			// borra columnas, solo agrega — de ahí el DROP explícito.
			Nombre:      "drop_columnas_tutor_de_paciente",
			Descripcion: "las 5 columnas tutor_* de la tabla `pacientes`, reemplazadas por la tabla `paciente_tutores` (un paciente puede tener más de un tutor)",
			Afectados: func(tx *gorm.DB) (int64, error) {
				return contarFilas(tx, `SELECT count(*) FROM information_schema.columns
					WHERE table_name = 'pacientes'
					  AND column_name IN ('tutor_relacion','tutor_nombre','tutor_dni','tutor_telefono','tutor_email')`)
			},
			Aplicar: func(tx *gorm.DB) error {
				return tx.Exec(`ALTER TABLE pacientes
					DROP COLUMN IF EXISTS tutor_relacion,
					DROP COLUMN IF EXISTS tutor_nombre,
					DROP COLUMN IF EXISTS tutor_dni,
					DROP COLUMN IF EXISTS tutor_telefono,
					DROP COLUMN IF EXISTS tutor_email`).Error
			},
		},
		{
			// Fase C de la auditoría (2026-09-09): filas de la era anterior a
			// TR-037, cuando `profesional_id` guardaba un `profesionales.id` y
			// no un `clinics.id`. El significado de la columna cambió a mitad
			// del proyecto y estas filas nunca se migraron; nadie lo notó
			// justamente porque no había foreign keys (ver migrate_fk.go).
			//
			// En la base de desarrollo eran 38 filas, todas del 22 al 24 de
			// agosto de 2026 (las sanas arrancan el 27), apuntando a 8-12
			// clínicas que no existen. Son INALCANZABLES para la aplicación:
			// cada query del panel filtra por `profesional_id = <clínica de la
			// sesión>`, y esas clínicas no existen, así que ninguna pantalla
			// puede mostrarlas ni ningún turno referenciarlas (verificado: 0
			// turnos apuntan a ellas).
			//
			// Hay que borrarlas antes de crear las foreign keys — si no, el
			// ADD CONSTRAINT las rechaza. Y se borran los hijos primero, para
			// no fabricar huérfanos nuevos al borrar las fichas.
			Nombre:      "limpiar_filas_legacy_sin_clinica",
			Descripcion: "turnos, fichas de paciente, tipos de consulta y páginas públicas que apuntan a una clínica inexistente (era anterior a TR-037), más lo que cuelga de esas fichas; a los turnos de una clínica REAL que quedaron apuntando a una ficha o tipo ya borrado se les suelta la referencia, no se borran",
			Afectados:   contarFilasLegacySinClinica,
			Aplicar:     borrarFilasLegacySinClinica,
		},
		{
			// Tercera ronda de correcciones de QA (2026-09-06), pedido
			// textual del cliente: el DNI del tutor "no es tan útil y
			// agrega complejidad" — se saca de las dos tablas donde vivía.
			Nombre:      "drop_dni_de_tutores",
			Descripcion: "la columna `dni` de `paciente_tutores` y `tutor_dni` de `turnos`, eliminadas a pedido del cliente",
			Afectados: func(tx *gorm.DB) (int64, error) {
				return contarFilas(tx, `SELECT count(*) FROM information_schema.columns
					WHERE (table_name = 'paciente_tutores' AND column_name = 'dni')
					   OR (table_name = 'turnos' AND column_name = 'tutor_dni')`)
			},
			Aplicar: func(tx *gorm.DB) error {
				if err := tx.Exec(`ALTER TABLE paciente_tutores DROP COLUMN IF EXISTS dni`).Error; err != nil {
					return err
				}
				return tx.Exec(`ALTER TABLE turnos DROP COLUMN IF EXISTS tutor_dni`).Error
			},
		},
	}
}

// migracionesDestructivasPrevias — las que tienen que correr ANTES del
// AutoMigrate.
//
// Que existan dos grupos no es una comodidad de organización: es una
// restricción real, y los dos bugs de orden de esta auditoría salieron
// justamente de ahí. Una migración va en este grupo cuando el propio
// AutoMigrate falla si ella no corrió antes.
//
// `borrar_turnos_pendientes` es el caso claro, y estaba mal ubicado desde
// antes de la Fase C (bug latente encontrado por
// migrate_destructiva_test.go, no por lectura): el check constraint
// `estado IN ('agendado','cancelada')` vive en el tag de GORM del modelo
// `Turno`, así que lo aplica el AutoMigrate — sobre una base con turnos
// `pendiente` de verdad, el AutoMigrate revienta con "check constraint is
// violated by some row" ANTES de que el DELETE tuviera ocasión de correr.
// El deploy moría ahí y no había forma de salir sin SQL a mano, igual que
// el bug de la deduplicación. CI no lo veía porque su base nace sin filas
// `pendiente`.
//
// Como corren antes del AutoMigrate, sus consultas de impacto tienen que
// tolerar que la tabla todavía no exista (base recién creada) — para eso
// está contarFilasSiExisteTabla.
func migracionesDestructivasPrevias() []MigracionDestructiva {
	return []MigracionDestructiva{
		migracionRebuildHorariosAtencion(),
		{
			// Extra 2.3.3 (TR-104): el estado `pendiente` se eliminó del
			// todo. Un turno pendiente nunca tuvo horario ni paciente
			// vinculado, así que —a diferencia del de-duplicado— no hay
			// nada que reasignar antes de borrar.
			Nombre:      "borrar_turnos_pendientes",
			Descripcion: "turnos en estado 'pendiente', un estado que ya no existe (TR-104): se borran para que el check constraint estrechado a ('agendado','cancelada') pueda aplicarse",
			Afectados: func(tx *gorm.DB) (int64, error) {
				return contarFilasSiExisteTabla(tx, "turnos", "SELECT count(*) FROM turnos WHERE estado = 'pendiente'")
			},
			Aplicar: func(tx *gorm.DB) error {
				return tx.Exec(`DELETE FROM turnos WHERE estado = 'pendiente'`).Error
			},
		},
	}
}

// migracionRebuildHorariosAtencion — corre ANTES del AutoMigrate, que es el
// que recrea la tabla con la forma nueva.
//
// Corrección de QA (2026-09-01): `horarios_atencion` pasó de 1 fila por
// clínica (PK = clinic_id, un único horario fijo) a una LISTA con alcance
// (general/semana/mes/rango), igual criterio que `bloqueos_horario` —
// "puede que un profesional tenga horarios de atención variable". GORM
// AutoMigrate no cambia una primary key ya existente, así que hace falta
// recrear la tabla a mano. La tabla vieja se detecta por la AUSENCIA de la
// columna `id`.
//
// Cada clínica que tuviera un horario guardado vuelve al general por
// defecto (08:00-18:00) hasta que lo guarde de nuevo: eso es exactamente lo
// que hay que aprobar a conciencia antes de correrla con datos reales.
func migracionRebuildHorariosAtencion() MigracionDestructiva {
	const tablaVieja = `SELECT count(*) FROM information_schema.tables t
		WHERE t.table_name = 'horarios_atencion'
		  AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
		                  WHERE c.table_name = 'horarios_atencion' AND c.column_name = 'id')`
	return MigracionDestructiva{
		Nombre:      "rebuild_horarios_atencion",
		Descripcion: "la tabla `horarios_atencion` con su forma vieja (una fila por clínica): se dropea para recrearla como lista con alcance — cada clínica pierde su horario guardado y vuelve al general por defecto",
		Afectados: func(tx *gorm.DB) (int64, error) {
			return contarFilas(tx, tablaVieja)
		},
		Aplicar: func(tx *gorm.DB) error {
			// Se re-chequea la forma vieja acá adentro, y no se dropea a
			// ciegas: si entre el conteo y el DROP la tabla ya fuera la
			// nueva, esto no la toca.
			return tx.Exec(`
				DO $$
				BEGIN
				  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'horarios_atencion')
				     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'horarios_atencion' AND column_name = 'id') THEN
				    DROP TABLE horarios_atencion;
				  END IF;
				END $$
			`).Error
		},
	}
}

// contarPacientesDuplicados — cuántas fichas se BORRARÍAN al deduplicar:
// por cada grupo (profesional_id, dni) con más de una ficha, todas menos la
// más vieja. `WHERE NOT en_conflicto` por el mismo motivo que el bloque de
// deduplicación (ver dedupPacientesPorDNI): dos fichas separadas A PROPÓSITO
// por un conflicto sin resolver no son un duplicado.
func contarPacientesDuplicados(tx *gorm.DB) (int64, error) {
	return contarFilas(tx, `
		SELECT COALESCE(SUM(cantidad - 1), 0) FROM (
		  SELECT COUNT(*) AS cantidad
		  FROM pacientes
		  WHERE NOT en_conflicto
		  GROUP BY profesional_id, dni
		  HAVING COUNT(*) > 1
		) AS grupos`)
}

// contarFilas — helper para las consultas de impacto de arriba. Para las
// migraciones POSTERIORES al AutoMigrate, donde las tablas ya existen sí o
// sí.
func contarFilas(tx *gorm.DB, query string) (int64, error) {
	var n int64
	if err := tx.Raw(query).Scan(&n).Error; err != nil {
		return 0, err
	}
	return n, nil
}

// contarFilasSiExisteTabla — la variante para las migraciones PREVIAS al
// AutoMigrate, que pueden encontrarse con una base recién creada donde la
// tabla todavía no existe.
//
// Se pregunta primero con `to_regclass`, que devuelve NULL en vez de fallar
// cuando el nombre no resuelve. Consultar la tabla directamente y atrapar
// el 42P01 NO funciona, aunque lo parezca: todo esto corre dentro de una
// transacción, y cualquier error de Postgres la aborta entera — el error
// atrapado del lado de Go deja igual la transacción envenenada, y todo lo
// que siga falla con 25P02 ("current transaction is aborted"). Bug real,
// encontrado por migrate_destructiva_test.go al crear una base desde cero.
func contarFilasSiExisteTabla(tx *gorm.DB, tabla, query string) (int64, error) {
	var existe bool
	if err := tx.Raw("SELECT to_regclass(?) IS NOT NULL", tabla).Scan(&existe).Error; err != nil {
		return 0, err
	}
	if !existe {
		return 0, nil
	}
	return contarFilas(tx, query)
}
