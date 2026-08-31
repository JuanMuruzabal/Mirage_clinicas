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
	// Migración manual (corrección de QA, 2026-09-01): horarios_atencion
	// pasa de 1 fila por clínica (PK=clinic_id, un único horario fijo) a
	// una LISTA con alcance (general/semana/mes/rango), igual criterio
	// que bloqueos_horario — "puede que un profesional tenga horarios de
	// atención variable". GORM AutoMigrate no cambia una primary key ya
	// existente, así que hace falta recrear la tabla a mano. Sin
	// producción todavía para este proyecto (CLAUDE.md): se dropea vacía
	// la primera vez que corre esta versión — cada clínica vuelve a ver
	// el horario general default (08:00-18:00) hasta que lo guarde de
	// nuevo. Detecta la tabla vieja por la AUSENCIA de la columna `id`
	// (idempotente: no vuelve a tocar la tabla una vez migrada).
	if err := gdb.Exec(`
		DO $$
		BEGIN
		  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'horarios_atencion')
		     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'horarios_atencion' AND column_name = 'id') THEN
		    DROP TABLE horarios_atencion;
		  END IF;
		END $$
	`).Error; err != nil {
		return fmt.Errorf("migración manual de horarios_atencion falló: %w", err)
	}

	if err := gdb.AutoMigrate(
		&Profesional{}, &Especialidad{}, &TipoConsulta{}, &Paciente{}, &Turno{}, &PaginaPublica{},
		// Esquema nuevo de auth/onboarding (docs/feature-sumarte-login.md) —
		// convive con Profesional hasta que internal/http/auth.go se
		// reescriba sobre estos modelos y Profesional se elimine del todo.
		&User{}, &Account{}, &VerificationToken{}, &ProfessionalProfile{},
		&Clinic{}, &ClinicMember{}, &ClinicInvitation{},
		&Session{}, &AuthRateCounter{}, &AuditEvent{},
		// F2.3 ("ajustes de calendario", Fase 2) — ver TR-078/TR-084.
		&HorarioAtencion{}, &BloqueoHorario{},
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

		// F2.3 (TR-084): un BloqueoHorario es o bien general (repite por
		// dia_semana, con alcance/fecha_desde/fecha_hasta) o bien específico
		// (una fecha puntual, sin dia_semana/alcance) — nunca una mezcla de
		// campos de los dos casos ni ninguno de los dos.
		`DO $$ BEGIN
		   ALTER TABLE bloqueos_horario ADD CONSTRAINT chk_bloqueo_horario_forma
		     CHECK (
		       (especifico = true AND fecha IS NOT NULL AND dia_semana IS NULL AND alcance IS NULL)
		       OR
		       (especifico = false AND fecha IS NULL AND dia_semana IS NOT NULL AND alcance IS NOT NULL)
		     );
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		// DROP + ADD (no el patrón DO $$/duplicate_object de arriba): esta
		// constraint cambió de valores permitidos (corrección de QA,
		// 2026-08-30, suma "proxima_semana"/"proximo_mes") — con
		// duplicate_object, una constraint ya creada con los valores VIEJOS
		// nunca se actualizaría sola. DROP CONSTRAINT IF EXISTS ya es
		// idempotente por sí solo.
		`ALTER TABLE bloqueos_horario DROP CONSTRAINT IF EXISTS chk_bloqueo_horario_alcance`,
		`ALTER TABLE bloqueos_horario ADD CONSTRAINT chk_bloqueo_horario_alcance
		   CHECK (alcance IS NULL OR alcance IN ('semana','mes','todos','proxima_semana','proximo_mes'))`,

		`DO $$ BEGIN
		   ALTER TABLE bloqueos_horario ADD CONSTRAINT chk_bloqueo_horario_tipo_regla
		     CHECK (tipo_regla = 'bloquear_horario');
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		// horarios_atencion (corrección de QA, 2026-09-01): "general" es
		// la única fila sin vigencia acotada; las demás SIEMPRE la tienen
		// (se resuelve un rango concreto al crearlas, igual que
		// bloqueos_horario) — nunca una mezcla de los dos casos.
		`DO $$ BEGIN
		   ALTER TABLE horarios_atencion ADD CONSTRAINT chk_horario_atencion_forma
		     CHECK (
		       (alcance = 'general' AND fecha_desde IS NULL AND fecha_hasta IS NULL)
		       OR (alcance <> 'general' AND fecha_desde IS NOT NULL AND fecha_hasta IS NOT NULL)
		     );
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		`DO $$ BEGIN
		   ALTER TABLE horarios_atencion ADD CONSTRAINT chk_horario_atencion_alcance
		     CHECK (alcance IN ('general','semana','mes','rango'));
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		// hora_desde/hora_hasta viajan siempre juntas — las dos NULL a la
		// vez es "no trabaja" ese período (corrección de QA: "si hay un
		// día que no trabaja el profesional, mostrar no hay horarios
		// disponibles"), nunca una sola de las dos.
		`DO $$ BEGIN
		   ALTER TABLE horarios_atencion ADD CONSTRAINT chk_horario_atencion_horas
		     CHECK ((hora_desde IS NULL) = (hora_hasta IS NULL));
		 EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		// A lo sumo una fila "general" por clínica — el CRUD la trata
		// como upsert (internal/http/horario_atencion.go), este índice es
		// la red de seguridad a nivel de base.
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_horario_atencion_general_unico
		   ON horarios_atencion (clinic_id) WHERE alcance = 'general'`,
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
