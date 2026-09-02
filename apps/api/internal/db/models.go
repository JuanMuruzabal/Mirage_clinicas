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
//
// DuracionMinutos/TiempoPostConsultaMinutos/CantidadSesiones (F2.3,
// TR-084 en docs/tradeoffs.md): el profesional los configura por tipo de
// consulta, no hay ningún buffer a nivel `Clinic` — "tiempo entre
// turnos" y "tiempo postconsulta" son el mismo concepto, pedido
// explícito del cliente ("consulta general dura 45min... quiero que
// después de terminar haya 20min donde no se pueda reservar turno").
// CantidadSesiones es puramente informativo esta fase (sin reserva
// automática de turnos encadenados, confirmado explícitamente por el
// cliente) — de ahí que sea un puntero: puede no estar cargado todavía.
type TipoConsulta struct {
	ID                        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID             uuid.UUID `gorm:"column:profesional_id;type:uuid;not null;index"`
	Nombre                    string    `gorm:"type:varchar(80);not null"`
	Color                     string    `gorm:"type:varchar(7);not null"`
	DuracionMinutos           int       `gorm:"column:duracion_minutos;not null;default:30"`
	TiempoPostConsultaMinutos int       `gorm:"column:tiempo_post_consulta_minutos;not null;default:0"`
	CantidadSesiones          *int      `gorm:"column:cantidad_sesiones"`
	// PreferenciaHoraDesde/PreferenciaHoraHasta (nueva función, pedido
	// textual del cliente, 2026-09-08): "el profesional solo quiere
	// atender consultas generales de 8:00 a 12:00... que la disponibilidad
	// de este tipo de turno sea afectada por esto" — ambos nil (sin
	// preferencia, la mayoría de los tipos) o ambos con valor ("HH:MM"),
	// nunca uno solo — ver validar() en tipos_consulta.go. Acota
	// calcularDisponibilidad SOLO para turnos de ESTE tipo, además de (no
	// en lugar de) el horario de atención general/excepciones/bloqueos —
	// nunca puede AMPLIAR el horario, solo recortarlo más.
	PreferenciaHoraDesde *string `gorm:"column:preferencia_hora_desde;type:varchar(5)"`
	PreferenciaHoraHasta *string `gorm:"column:preferencia_hora_hasta;type:varchar(5)"`
	CreatedAt            time.Time
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

// VerificacionTurnoPublico — pedido explícito del cliente (Extra 2.3.5):
// "Confirmanos que sos vos", un paso más del wizard público de pedido de
// turno antes de "pedir turno" de verdad — un código de 6 dígitos al mail
// que puso, mismo mecanismo que la verificación de cuenta (TR-055,
// internal/mail + internal/security.NewNumericCode), pero sin ningún User
// detrás: quien completa el formulario público es un visitante anónimo,
// no una cuenta con sesión.
//
// Una sola fila cubre las DOS fases del flujo, reusando `ExpiresAt` para
// lo que corresponda en cada momento (nunca se chequean las dos ventanas
// a la vez, así que no hace falta una columna separada por fase):
//  1. Al mandar el código (enviarVerificacionTurnoPublicoHandler):
//     CodigoHash con hash del código, ExpiresAt = ahora + 15 min (mismo
//     TTL que verificationCodeTTL de auth.go) — la ventana para
//     TIPEARLO.
//  2. Al confirmarlo bien (confirmarVerificacionTurnoPublicoHandler): se
//     emite un token opaco de un solo uso (TokenHash, mismo mecanismo
//     que sesiones/reset de password — security.NewToken) y ExpiresAt se
//     ADELANTA a ahora + 30 min — la ventana para TERMINAR el resto del
//     wizard (tipo de consulta → fecha → horario) y mandar ese token
//     junto con el pedido de turno final.
//
// TokenHash es *string (no string) para que el índice único permita
// múltiples filas sin confirmar todavía (todas con NULL) sin chocar entre
// sí — Postgres no compara NULLs como iguales bajo un índice único.
type VerificacionTurnoPublico struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ClinicID   uuid.UUID  `gorm:"column:clinic_id;type:uuid;not null;index"`
	Email      string     `gorm:"type:varchar(255);not null"`
	CodigoHash string     `gorm:"column:codigo_hash;type:varchar(64);not null"`
	TokenHash  *string    `gorm:"column:token_hash;type:varchar(64);uniqueIndex"`
	ExpiresAt  time.Time  `gorm:"column:expires_at;not null"`
	VerifiedAt *time.Time `gorm:"column:verified_at"`
	// UsedAt: dos sentidos distintos según la fase (nunca ambiguo porque
	// nunca se leen juntos) — antes de verificar, marca un código
	// invalidado por uno más nuevo (TR-055: "invalida tokens previos sin
	// usar antes de emitir uno nuevo"); después de verificar, marca el
	// token de prueba ya consumido por el POST /turnos final (de un solo
	// uso, no se puede reusar para pedir un segundo turno con el mismo
	// código verificado).
	UsedAt    *time.Time `gorm:"column:used_at"`
	CreatedAt time.Time
}

func (VerificacionTurnoPublico) TableName() string { return "verificaciones_turno_publico" }

// Turno es la pieza central del esquema (spec §4.3/§4.4). El estado
// `pendiente` (turno del formulario público sin horario fijo todavía,
// TR-006) existió hasta Extra 2.3.5 — el formulario público ahora asigna
// horario real de entrada (TR-100), así que todo turno nace `agendado` de
// punta a punta; `pendiente` se sacó del todo (Extra 2.3.3, TR-104):
// nunca más un valor válido de `Estado`, ni en el check constraint ni en
// ningún código que lo use.
type Turno struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID  uuid.UUID  `gorm:"column:profesional_id;type:uuid;not null;index"`
	PacienteID     *uuid.UUID `gorm:"column:paciente_id;type:uuid;index"`
	TipoConsultaID *uuid.UUID `gorm:"column:tipo_consulta_id;type:uuid"`
	// Estado: 'agendado' | 'cancelada' (spec §4.4, TR-104).
	Estado string `gorm:"type:varchar(20);not null;default:agendado;check:estado IN ('agendado','cancelada')"`
	// HoraInicio/HoraFin: siempre fijos desde TR-104 (todo turno nace
	// `agendado`). La columna generada `rango_horario` (tstzrange) y el
	// exclusion constraint que la usa se agregan en RunMigrations vía SQL
	// crudo — GORM no puede expresarlos.
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

	// Asistencia: nil (todavía sin marcar) | 'asistio' | 'ausente' — pedido
	// explícito del cliente, 2026-09-04: "los turnos resueltos ahora tienen
	// la opción al ser tocados de marcar asistidos o ausente, cosa de poder
	// guardar ese dato". Solo tiene sentido en un turno ya resuelto
	// (agendado + hora de fin ya pasada, ver marcarAsistenciaHandler en
	// turnos.go) — nunca obligatorio, la enorme mayoría de turnos viejos
	// queda con esto en nil para siempre.
	Asistencia *string `gorm:"column:asistencia;type:varchar(20);check:asistencia IN ('asistio','ausente')"`

	// Autoreservado (nueva función, 2026-09-08): marca un turno movido por
	// el botón "Autoreservar turnos" del modal de conflicto
	// (bloqueo-detalle-modal.tsx) — el profesional pidió el traslado
	// automático al próximo horario libre en vez de coordinar el cambio a
	// mano con el paciente. Puramente informativo: se pinta con rayas en
	// el calendario y avisa en el detalle del turno que fue reprogramado
	// así, para que el profesional sepa por qué cambió de horario solo.
	Autoreservado bool `gorm:"column:autoreservado;not null;default:false"`

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
