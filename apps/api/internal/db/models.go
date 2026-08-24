package db

import (
	"time"

	"github.com/google/uuid"
)

// Modelos GORM del esquema inicial (docs/implementation-plan.md §2.1 — la
// spec no trae un ERD propio, este es el modelo propuesto en la fase de
// planificación). Especialidad y TipoConsulta son catálogos (TR-001/TR-004
// en docs/tradeoffs.md); Paciente/Turno/PaginaPublica se amplían en los
// sprints que los usan (Sprint 2-4).

// Profesional refleja el alta individual de un odontólogo (spec §3 — sin
// organizaciones en el MVP, ver TR-009).
type Profesional struct {
	ID     uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Nombre string    `gorm:"type:varchar(150);not null"`
	Email  string    `gorm:"type:varchar(255);not null;uniqueIndex"`
	// PasswordHash: nunca se serializa a JSON (ver usuarioResponse en
	// internal/http/auth.go) — bcrypt, TR-005 en docs/tradeoffs.md.
	PasswordHash string  `gorm:"column:password_hash;type:varchar(255);not null"`
	Telefono     *string `gorm:"type:varchar(50)"`
	// NombreClinica/Slug (spec §3, paso 5): Slug deriva la ruta pública
	// /clinica-x (docs/implementation-plan.md §2.1) — único, generado a
	// partir de NombreClinica al registrarse.
	NombreClinica string `gorm:"column:nombre_clinica;type:varchar(200);not null"`
	Slug          string `gorm:"type:varchar(220);not null;uniqueIndex"`

	Especialidades []Especialidad `gorm:"many2many:profesional_especialidades;"`

	CreatedAt time.Time
	UpdatedAt time.Time
}

func (Profesional) TableName() string { return "profesionales" }

// Especialidad es un catálogo cerrado predefinido por Mirage (TR-004) —
// el profesional selecciona de esta lista, no crea especialidades libres.
// Sembrado en Sprint 1 (T1.3) cuando exista el flujo de onboarding que las
// necesita; el esquema ya queda listo desde T0.3.
//
// Activa (TR-011 en docs/tradeoffs.md, 2026-08-22): el catálogo completo
// queda sembrado en la base, pero GET /especialidades solo devuelve las
// activas — hoy únicamente "Odontología general", hasta que el cliente
// confirme el resto de la lista (spec §7.4). Ocultar es cambiar
// EspecialidadesVisibles en seed.go, no una migración de datos.
type Especialidad struct {
	ID     uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Nombre string    `gorm:"type:varchar(120);not null;uniqueIndex"`
	Activa bool      `gorm:"not null;default:true"`
}

func (Especialidad) TableName() string { return "especialidades" }

// TipoConsulta es un catálogo por profesional (TR-001), no global: cada
// Profesional nuevo recibe sus propios dos tipos por defecto al
// registrarse (ver SeedTiposConsultaDefault más abajo, usado desde
// internal/http/auth.go). Color es el hex del bloque de calendario (spec
// §4.3) — "cascarón"/"urgencia" del Sistema Cascarón (docs/tradeoffs.md
// TR-010), nunca un color de marca.
type TipoConsulta struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID uuid.UUID `gorm:"column:profesional_id;type:uuid;not null;index"`
	Nombre        string    `gorm:"type:varchar(80);not null"`
	Color         string    `gorm:"type:varchar(7);not null"`
	CreatedAt     time.Time
}

func (TipoConsulta) TableName() string { return "tipos_consulta" }

// Colores/nombres seedeados para todo profesional nuevo (TR-001/TR-010).
const (
	NombreTipoConsultaGeneral  = "Consulta general"
	ColorTipoConsultaGeneral   = "#E7D9BE" // cascarón
	NombreTipoConsultaUrgencia = "Urgencia"
	ColorTipoConsultaUrgencia  = "#D6563A" // urgencia
)

// Paciente se crea automáticamente cuando un turno pendiente se agenda
// (spec §4.5) — el esquema ya existe desde T0.3, el alta real es T2.4.
type Paciente struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID uuid.UUID `gorm:"column:profesional_id;type:uuid;not null;index"`
	Nombre        string    `gorm:"type:varchar(150);not null"`
	Apellido      string    `gorm:"type:varchar(150);not null"`
	DNI           string    `gorm:"type:varchar(20);not null"`
	Telefono      string    `gorm:"type:varchar(30);not null"`
	Email         *string   `gorm:"type:varchar(255)"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (Paciente) TableName() string { return "pacientes" }

// Turno es la pieza central del esquema (spec §4.3/§4.4). Mientras está
// `pendiente` (llegó del formulario público, spec §4.4) todavía no tiene
// paciente_id ni horario fijo — esos campos de contacto quedan sueltos acá
// hasta que el profesional lo agenda desde el modal "+ Agregar turno"
// (spec §4.3), momento en el que se crea/vincula el Paciente y se fija
// HoraInicio/HoraFin. Ver TR-006 en docs/tradeoffs.md.
type Turno struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID  uuid.UUID  `gorm:"column:profesional_id;type:uuid;not null;index"`
	PacienteID     *uuid.UUID `gorm:"column:paciente_id;type:uuid;index"`
	TipoConsultaID *uuid.UUID `gorm:"column:tipo_consulta_id;type:uuid"`
	// Estado: 'pendiente' | 'agendado' | 'cancelada' (spec §4.4).
	Estado string `gorm:"type:varchar(20);not null;default:pendiente;check:estado IN ('pendiente','agendado','cancelada')"`
	// HoraInicio/HoraFin: nil mientras `pendiente`. La columna generada
	// `rango_horario` (tstzrange) y el exclusion constraint que la usa se
	// agregan en RunMigrations vía SQL crudo — GORM no puede expresarlos.
	HoraInicio *time.Time `gorm:"column:hora_inicio"`
	HoraFin    *time.Time `gorm:"column:hora_fin"`

	// Datos de contacto del formulario público (spec §4.4) — se guardan acá
	// mientras el turno está `pendiente`, porque todavía no existe un
	// Paciente vinculado.
	NombreContacto   string `gorm:"column:nombre_contacto;type:varchar(150);not null"`
	ApellidoContacto string `gorm:"column:apellido_contacto;type:varchar(150);not null"`
	DNIContacto      string `gorm:"column:dni_contacto;type:varchar(20);not null"`
	TelefonoContacto string `gorm:"column:telefono_contacto;type:varchar(30);not null"`
	EmailContacto    string `gorm:"column:email_contacto;type:varchar(255);not null"`
	Motivo           string `gorm:"type:text"`

	// Origen: 'pagina_publica' | 'manual' (creado directo desde el modal,
	// spec §4.3, "para consultas que no llegaron por la página").
	Origen string `gorm:"type:varchar(20);not null;default:pagina_publica;check:origen IN ('pagina_publica','manual')"`

	CreatedAt time.Time
	UpdatedAt time.Time
}

func (Turno) TableName() string { return "turnos" }

// PaginaPublica es 1:1 con Profesional (spec §5). Oculta controla el modo
// mantenimiento (spec §5.2); DeployadaEn nil significa que la clínica
// nunca hizo el primer deploy y por lo tanto nunca aparece en el buscador
// público (spec §5.2, FR-10) — el esquema existe desde T0.3, el editor y
// el deploy son Sprint 4.
type PaginaPublica struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID uuid.UUID  `gorm:"column:profesional_id;type:uuid;not null;uniqueIndex"`
	Oculta        bool       `gorm:"not null;default:false"`
	DeployadaEn   *time.Time `gorm:"column:deployada_en"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (PaginaPublica) TableName() string { return "paginas_publicas" }
