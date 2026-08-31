package db

import (
	"time"

	"github.com/google/uuid"
)

// Modelos de F2.3 ("ajustes de calendario", Fase 2) — ver TR-078 y TR-084
// en docs/tradeoffs.md, y docs/implementation-plan.md §11.3. Ambas tablas
// van por ClinicID, no por el ProfesionalID legacy (mismo criterio que el
// resto del esquema post-auth: cada Clinic "individual" nace con el mismo
// UUID que tenía su Profesional de origen, así que ProfesionalID en
// Turno/TipoConsulta/Paciente ya apunta a Clinic.ID en los hechos — ver el
// comment grande en models_auth.go).
//
// Horas de un día ("HH:MM", sin fecha) se guardan como string varchar(5),
// no como time.Time completo — son horarios de pared, no instantes fijos
// en el calendario (spec ya usa internal/clock.Today() para "hoy", nunca
// time.Now() directo; acá ni siquiera hace falta una zona horaria, son
// solo horas del día). Comparación lexicográfica de "HH:MM" funciona
// igual que comparación numérica gracias al padding con cero.

// HorarioAtencion — rediseño 2026-09-01 (corrección de QA: "puede que un
// profesional tenga horarios de atención variable"). Antes era 1:1 con
// Clinic (PK=clinic_id), un único horario fijo para todos los días; ahora
// es una LISTA por clínica, cada fila con un Alcance — mismo criterio que
// BloqueoHorario (TR-084):
//   - "general": el único que no lleva FechaDesde/FechaHasta — el
//     horario de siempre, vigente salvo que otra fila lo tape. Debería
//     haber como mucho una por clínica (no hay constraint de base que lo
//     obligue; el CRUD de internal/http/horario_atencion.go lo trata como
//     upsert por clinic_id+alcance).
//   - "semana"/"mes": igual que en BloqueoHorario, se resuelven a un
//     FechaDesde/FechaHasta concreto al crearlas ("de una sola vez", no
//     recurrente).
//   - "rango": la única con fechas elegidas a mano por el profesional
//     ("después de este [alcance] estará de qué día a qué día") — para
//     un período que no calza con "esta semana"/"este mes".
//
// Al calcular disponibilidad (internal/http/disponibilidad.go), la fila
// más específica vigente ese día gana: rango > semana > mes > general.
//
// HoraDesde/HoraHasta son NULLABLE a propósito: las dos en NULL a la vez
// significa "no trabaja" ese período (corrección de QA: "si hay un día
// que no trabaja el profesional, mostrar no hay horarios disponibles") —
// la fila "general" no debería quedar nunca así (siempre tiene que haber
// un horario base), pero nada a nivel de base lo impide; si pasa, ese día
// simplemente no ofrece ningún horario hasta que se corrija.
type HorarioAtencion struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ClinicID   uuid.UUID  `gorm:"column:clinic_id;type:uuid;not null;index"`
	Alcance    string     `gorm:"type:varchar(20);not null;default:'general'"`
	FechaDesde *time.Time `gorm:"column:fecha_desde;type:date"`
	FechaHasta *time.Time `gorm:"column:fecha_hasta;type:date"`
	HoraDesde  *string    `gorm:"column:hora_desde;type:varchar(5)"`
	HoraHasta  *string    `gorm:"column:hora_hasta;type:varchar(5)"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (HorarioAtencion) TableName() string { return "horarios_atencion" }

const (
	HorarioAtencionAlcanceGeneral = "general"
	HorarioAtencionAlcanceSemana  = "semana"
	HorarioAtencionAlcanceMes     = "mes"
	HorarioAtencionAlcanceRango   = "rango"
)

// BloqueoHorario cubre TANTO reglas generales como específicas (mismo
// recurso, distinguidas por Especifico) — F2.3, TR-084:
//
//   - General (Especifico=false): repite por DiaSemana (0=domingo..6=sábado,
//     mismo criterio que Postgres EXTRACT(DOW)), con Alcance que dice CUÁNTO
//     dura la regla — "semana"/"mes" son de una sola vez, resueltas a un
//     FechaDesde/FechaHasta concreto en el momento de crearla (el período
//     calendario vigente en ese instante); "todos" no tiene fecha de fin,
//     se repite indefinido por DiaSemana solo.
//   - Específica (Especifico=true): una Fecha puntual, sin DiaSemana ni
//     Alcance — gana sobre cualquier regla general que se solape en el
//     mismo día/horario (se resuelve al calcular disponibilidad, F2.4.1 —
//     TR-079/TR-084 —, no hay nada a nivel de base que impida que ambas
//     existan a la vez).
//
// TipoRegla like un catálogo abierto pensado para crecer — hoy el único
// valor válido es "bloquear_horario" (el check constraint de abajo, en
// migrate.go, lo fija así hasta que aparezca un segundo tipo de regla).
type BloqueoHorario struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ClinicID   uuid.UUID `gorm:"column:clinic_id;type:uuid;not null;index"`
	Especifico bool      `gorm:"not null;default:false"`

	// Solo si Especifico=false (regla general). varchar(20), no 10 —
	// corrección de QA, 2026-08-30: se agregan "proxima_semana"/
	// "proximo_mes" (14/11 caracteres) junto a "semana"/"mes"/"todos".
	Alcance    *string    `gorm:"type:varchar(20)"`
	DiaSemana  *int       `gorm:"column:dia_semana"`
	FechaDesde *time.Time `gorm:"column:fecha_desde;type:date"`
	FechaHasta *time.Time `gorm:"column:fecha_hasta;type:date"`

	// Solo si Especifico=true (regla específica, un día concreto).
	Fecha *time.Time `gorm:"type:date"`

	// Horario bloqueado dentro del día — aplica a los dos tipos de regla.
	HoraDesde string `gorm:"column:hora_desde;type:varchar(5);not null"`
	HoraHasta string `gorm:"column:hora_hasta;type:varchar(5);not null"`

	TipoRegla string `gorm:"column:tipo_regla;type:varchar(30);not null;default:'bloquear_horario'"`

	// Motivo (corrección de QA, F2.3): "poder ponerle motivo y que
	// aparezca visible en el calendario, ejemplo: una general puede ser
	// limpieza semanal, una específica puede ser reposición de
	// inventario" — opcional, puramente descriptivo, no afecta el
	// cálculo de disponibilidad.
	Motivo *string `gorm:"type:varchar(200)"`

	CreatedAt time.Time
	UpdatedAt time.Time
}

func (BloqueoHorario) TableName() string { return "bloqueos_horario" }

const (
	BloqueoAlcanceSemana = "semana"
	BloqueoAlcanceMes    = "mes"
	BloqueoAlcanceTodos  = "todos"
	// ProximaSemana/ProximoMes (corrección de QA, 2026-08-30) — mismo
	// criterio "de una sola vez" que Semana/Mes (TR-084: se resuelven a
	// un FechaDesde/FechaHasta concreto al crearlas, no un patrón que se
	// repite), pero anclado a la semana/mes SIGUIENTE al actual en vez
	// del actual.
	BloqueoAlcanceProximaSemana = "proxima_semana"
	BloqueoAlcanceProximoMes    = "proximo_mes"

	TipoReglaBloquearHorario = "bloquear_horario"
)
