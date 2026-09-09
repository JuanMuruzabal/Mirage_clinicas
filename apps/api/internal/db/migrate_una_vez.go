package db

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

// Migraciones de DATOS que corren UNA SOLA VEZ — Fase B de la auditoría de
// seguridad/optimización (2026-09-08, docs/Seguridad y optimizacion/).
//
// Todo lo que vive en migrate.go es idempotente A PROPÓSITO y se re-ejecuta
// en cada arranque sin costo real (CREATE ... IF NOT EXISTS, DO $$ ...
// EXCEPTION WHEN duplicate_object). Este archivo es para el otro caso: una
// migración que BARRE DATOS, cuyo costo crece con el volumen de la base y
// que, después de correr bien una vez, nunca vuelve a encontrar nada que
// corregir — repetirla en cada deploy es puro desperdicio que empeora solo.

// migracionDedupPacientesDNI — nombre estable de la migración en la tabla
// de control. NUNCA cambiarlo una vez deployado: es la clave que decide si
// ya corrió.
const migracionDedupPacientesDNI = "dedup_pacientes_por_dni"

// migracionYaAplicada consulta la tabla de control. Separada de
// registrarMigracion para que el guardián de las migraciones destructivas
// (migrate_destructiva.go) pueda preguntar sin aplicar nada.
func migracionYaAplicada(gdb *gorm.DB, nombre string) (bool, error) {
	// La tabla existe siempre en este punto: runMigrationsLocked la crea
	// como primer paso, ANTES de cualquier migración destructiva (ver el
	// comentario grande ahí). No se intenta recuperarse de que falte, y es
	// deliberado: todo esto corre dentro de una transacción, donde
	// cualquier error de Postgres la aborta entera — atraparlo del lado de
	// Go no la devuelve a la vida, todo lo que siga falla con 25P02
	// ("current transaction is aborted"). Bug real, encontrado por
	// migrate_destructiva_test.go al crear una base desde cero.
	var ya MigracionUnaVez
	err := gdb.Where("nombre = ?", nombre).First(&ya).Error
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return false, fmt.Errorf("no se pudo consultar migraciones_una_vez (%s): %w", nombre, err)
}

// registrarMigracion corre fn y anota el nombre en la MISMA transacción —
// o pasan las dos cosas, o ninguna. Ese detalle es todo el diseño: un
// registro hecho aparte dejaría la migración marcada como aplicada sin
// haberlo estado si fn falla a mitad de camino. Si fn falla, no queda
// registrada y el próximo arranque la vuelve a intentar.
func registrarMigracion(gdb *gorm.DB, nombre string, fn func(tx *gorm.DB) error) error {
	return gdb.Transaction(func(tx *gorm.DB) error {
		if err := fn(tx); err != nil {
			return fmt.Errorf("migración de una vez %q falló: %w", nombre, err)
		}
		return tx.Create(&MigracionUnaVez{Nombre: nombre}).Error
	})
}

// Extra 2.3.5 (E5.1): antes de que existiera el índice único de abajo,
// ya se habían cargado Paciente duplicados (mismo profesional_id+dni)
// en desarrollo — sin producción todavía (CLAUDE.md), pero el CREATE
// UNIQUE INDEX de abajo fallaría igual contra esos datos ya
// cargados. Este bloque deja una sola fila por (profesional_id, dni)
// — la más vieja (MIN(created_at), MIN(id) como desempate) — reasigna
// cualquier turno que apuntara a una fila descartada hacia la que se
// conserva, y recién después borra las descartadas. Idempotente: sin
// duplicados, el loop no encuentra filas y no hace nada.
//
// Corrección de bug real (encontrado en QA en vivo, Fase 2.4.1):
// este bloque corre en CADA RunMigrations (cada deploy/reinicio del
// contenedor `migrate`), sin ningún guard de "una sola vez" — y
// hasta acá agrupaba TODAS las fichas por (profesional_id, dni) sin
// excluir `en_conflicto`. Eso significa que dos fichas separadas
// A PROPÓSITO por un conflicto sin resolver (crearPacientePublicoConDeteccionDeConflicto,
// paciente_conflicto_publico.go — la razón de ser de en_conflicto)
// quedaban agrupadas igual que un duplicado real, y la ficha
// en_conflicto=true se borraba y su turno se reasignaba a la otra
// EN CADA DEPLOY, sin pasar por ConflictoPaciente ni por
// migrarOCancelarTurnosDePerdedor — deshaciendo en silencio toda la
// detección de conflicto. `WHERE NOT en_conflicto` restringe el
// barrido a lo que este bloque siempre debió limpiar: fichas
// duplicadas de verdad que violan el índice parcial de abajo
// (idx_paciente_dni_unico, también `WHERE NOT en_conflicto`) —
// nunca una ficha en conflicto todavía sin resolver.
func dedupPacientesPorDNI(tx *gorm.DB) error {
	return tx.Exec(`DO $$
		DECLARE
		  duplicado RECORD;
		  ids uuid[];
		  conservar uuid;
		  descartar uuid[];
		BEGIN
		  FOR duplicado IN
		    SELECT array_agg(id ORDER BY created_at, id) AS ids
		    FROM pacientes
		    WHERE NOT en_conflicto
		    GROUP BY profesional_id, dni
		    HAVING COUNT(*) > 1
		  LOOP
		    ids := duplicado.ids;
		    conservar := ids[1];
		    descartar := ids[2:array_length(ids, 1)];
		    UPDATE turnos SET paciente_id = conservar WHERE paciente_id = ANY(descartar);
		    DELETE FROM pacientes WHERE id = ANY(descartar);
		  END LOOP;
		END $$`).Error
}
