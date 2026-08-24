package db

import (
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// RunMigrations aplica el esquema inicial (docs/implementation-plan.md
// §2.1): AutoMigrate de GORM para las tablas base, y a continuación el SQL
// crudo que GORM no puede expresar — la extensión btree_gist, la columna
// generada `rango_horario` (tstzrange) y el exclusion constraint que
// evita turnos solapados (spec §4.3, regla de negocio no negociable; ver
// TR-006 en docs/tradeoffs.md). Es idempotente: se puede correr muchas
// veces sin error.
func RunMigrations(gdb *gorm.DB) error {
	if err := gdb.AutoMigrate(
		&Profesional{}, &Especialidad{}, &TipoConsulta{}, &Paciente{}, &Turno{}, &PaginaPublica{},
	); err != nil {
		return fmt.Errorf("automigrate: %w", err)
	}

	statements := []string{
		`CREATE EXTENSION IF NOT EXISTS btree_gist`,

		// Columna generada: se recalcula sola a partir de hora_inicio/hora_fin.
		// Con ambos NULL (turnos `pendiente`, que todavía no tienen horario
		// asignado — spec §4.3/§4.4) da un rango vacío, que nunca conflictúa
		// con nada — el exclusion constraint de abajo solo mira turnos
		// `agendado` de todos modos (TR-006).
		`ALTER TABLE turnos
		   ADD COLUMN IF NOT EXISTS rango_horario tstzrange
		   GENERATED ALWAYS AS (tstzrange(hora_inicio, hora_fin, '[)')) STORED`,

		// Un turno `agendado` no puede tener horario nulo (evita que termine
		// con un rango_horario vacío que lo deje fuera del constraint por
		// error de datos, no por diseño).
		`DO $$ BEGIN
		   ALTER TABLE turnos ADD CONSTRAINT chk_turno_agendado_horario
		     CHECK (
		       estado <> 'agendado'
		       OR (hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_fin > hora_inicio)
		     );
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		// La constraint central del proyecto (spec §4.3): a nivel de base de
		// datos, dos turnos `agendado` del mismo profesional no pueden tener
		// horarios que se solapen. Turnos `pendiente`/`cancelada` nunca
		// conflictúan — el WHERE los excluye del todo, no alcanza con que su
		// rango_horario esté vacío.
		`DO $$ BEGIN
		   ALTER TABLE turnos ADD CONSTRAINT sin_solapamiento_turno
		     EXCLUDE USING gist (
		       profesional_id WITH =,
		       rango_horario WITH &&
		     )
		     WHERE (estado = 'agendado');
		 EXCEPTION
		   WHEN duplicate_object THEN NULL;
		   WHEN duplicate_table THEN NULL;
		 END $$`,
	}

	for _, stmt := range statements {
		if err := gdb.Exec(stmt).Error; err != nil {
			return fmt.Errorf("migración cruda falló (%s): %w", stmt, err)
		}
	}

	// TR-004: el catálogo de especialidades es global (a diferencia de
	// tipos_consulta, que es por profesional) — se siembra acá, una vez
	// por esquema, no por cada alta de profesional.
	if err := SeedEspecialidadesCatalogo(gdb); err != nil {
		return err
	}

	return nil
}

// SeedTiposConsultaDefault crea los dos tipos de consulta por defecto de un
// profesional recién registrado (TR-001 en docs/tradeoffs.md: catálogo por
// profesional, no global) — llamado una sola vez desde el handler de
// registro (internal/http/auth.go), no desde RunMigrations, porque
// necesita un profesionalID que todavía no existe al migrar el esquema.
func SeedTiposConsultaDefault(gdb *gorm.DB, profesionalID uuid.UUID) error {
	tipos := []TipoConsulta{
		{ProfesionalID: profesionalID, Nombre: NombreTipoConsultaGeneral, Color: ColorTipoConsultaGeneral},
		{ProfesionalID: profesionalID, Nombre: NombreTipoConsultaUrgencia, Color: ColorTipoConsultaUrgencia},
	}
	if err := gdb.Create(&tipos).Error; err != nil {
		return fmt.Errorf("seed de tipos_consulta falló: %w", err)
	}
	return nil
}
