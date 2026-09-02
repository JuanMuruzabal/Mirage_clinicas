package db

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Modelos del nuevo sistema de auth/onboarding (docs/feature-sumarte-login.md).
// Reemplazan a Profesional como dueño de la identidad — Profesional pasa a
// ser eliminado una vez que internal/http/auth.go se reescribe sobre estos
// modelos (ver el plan de implementación, decisión #2: cada Clinic tipo
// "individual" nace con el mismo UUID que tenía su Profesional de origen,
// así que turnos/pacientes/tipos_consulta/paginas_publicas — que no
// declaran una asociación GORM a Profesional, solo un campo ProfesionalID
// suelto, así que no hay FK real en la base que repuntar — siguen
// resolviendo exactamente igual sin tocarse).
//
// Nomenclatura en inglés (User/Account/Clinic/...) a diferencia del resto
// del esquema (Profesional/Turno/Paciente en español): así los nombra la
// spec de esta feature explícitamente — es una mezcla intencional, no un
// descuido de consistencia.

// User es la identidad central: una fila por persona, sin importar si
// entró con Google, con email+password, o con ambos vinculados (Account).
type User struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Email           string     `gorm:"type:varchar(255);not null;uniqueIndex"`
	EmailVerifiedAt *time.Time `gorm:"column:email_verified_at"`
	// PasswordHash nil = la cuenta solo tiene Google vinculado, nunca
	// definió contraseña propia. Nunca se serializa a JSON (mismo criterio
	// que Profesional.PasswordHash hoy).
	PasswordHash *string `gorm:"column:password_hash;type:varchar(255)"`

	// OnboardingStep gobierna el guard del wizard (spec §4): "cuenta" recién
	// creada, "perfil" cuenta+mail verificados pendiente de ProfessionalProfile,
	// "clinica" perfil completo pendiente de Clinic, "completo" ya usa el
	// panel con normalidad.
	OnboardingStep        string     `gorm:"column:onboarding_step;type:varchar(20);not null;default:'cuenta';check:onboarding_step IN ('cuenta','perfil','clinica','completo')"`
	OnboardingCompletedAt *time.Time `gorm:"column:onboarding_completed_at"`

	// TermsAcceptedAt/TermsVersion — Ley 25.326 (spec §7): checkbox
	// explícito de ToS/privacidad al crear la cuenta, con fecha y versión.
	TermsAcceptedAt *time.Time `gorm:"column:terms_accepted_at"`
	TermsVersion    *string    `gorm:"column:terms_version;type:varchar(20)"`

	CreatedAt time.Time
	UpdatedAt time.Time
	// DeletedAt: soft delete — mecanismo "previsto" para el borrado de
	// cuenta que pide Ley 25.326 (spec §7); no hay todavía un flujo
	// self-service de borrado, ver docs/tradeoffs.md.
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

func (User) TableName() string { return "users" }

// Valores válidos de User.OnboardingStep — única fuente de verdad,
// consumida tanto por el guard del wizard como por los handlers de
// onboarding.
const (
	OnboardingStepCuenta   = "cuenta"
	OnboardingStepPerfil   = "perfil"
	OnboardingStepClinica  = "clinica"
	OnboardingStepCompleto = "completo"
)

// Account vincula un provider OAuth (hoy solo "google") a un User. No
// persiste tokens de acceso/refresco de Google a propósito — minimización
// de datos (Ley 25.326) y no hay ningún caso de uso hoy que necesite
// volver a llamar la API de Google después del login (ver el plan).
type Account struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID            uuid.UUID `gorm:"column:user_id;type:uuid;not null;index"`
	Provider          string    `gorm:"type:varchar(30);not null;uniqueIndex:idx_account_provider"`
	ProviderAccountID string    `gorm:"column:provider_account_id;type:varchar(255);not null;uniqueIndex:idx_account_provider"`
	CreatedAt         time.Time
}

func (Account) TableName() string { return "accounts" }

const ProviderGoogle = "google"

// VerificationToken respalda tanto la verificación de mail como el reset
// de contraseña (spec §7: 32 bytes CSPRNG en base64url del lado del
// cliente/link, acá solo se guarda el hash SHA-256 — nunca el token en
// claro). UserID en vez de un "identifier" string suelto: más robusto si
// el email cambia a mitad de un flujo pendiente.
type VerificationToken struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    uuid.UUID  `gorm:"column:user_id;type:uuid;not null;index"`
	TokenHash string     `gorm:"column:token_hash;type:varchar(64);not null;uniqueIndex"`
	Type      string     `gorm:"type:varchar(30);not null;check:type IN ('email_verify','password_reset')"`
	ExpiresAt time.Time  `gorm:"column:expires_at;not null"`
	UsedAt    *time.Time `gorm:"column:used_at"`
	CreatedAt time.Time
}

func (VerificationToken) TableName() string { return "verification_tokens" }

const (
	VerificationTokenEmailVerify   = "email_verify"
	VerificationTokenPasswordReset = "password_reset"
)

// ProfessionalProfile es 1:1 con User (PK=FK) — los datos propios del
// odontólogo (spec §4, Paso 2). Especialidades sigue siendo many2many
// contra el catálogo global Especialidad (TR-004 en docs/tradeoffs.md, sin
// cambios) — solo cambia la tabla puente, de profesional_especialidades a
// professional_especialidades, con FK a user_id en vez de profesional_id.
type ProfessionalProfile struct {
	UserID           uuid.UUID `gorm:"column:user_id;type:uuid;primaryKey"`
	Nombre           string    `gorm:"type:varchar(150);not null"`
	Apellido         string    `gorm:"type:varchar(150);not null"`
	TelefonoPrefijo  string    `gorm:"column:telefono_prefijo;type:varchar(6);not null;default:'+54'"`
	Telefono         string    `gorm:"type:varchar(50);not null"`
	Documento        *string   `gorm:"type:varchar(20)"`
	MatriculaTipo    string    `gorm:"column:matricula_tipo;type:varchar(20);not null;default:'';check:matricula_tipo IN ('','nacional','provincial')"`
	MatriculaNumero  string    `gorm:"column:matricula_numero;type:varchar(50);not null;default:''"`
	AniosExperiencia *int      `gorm:"column:anios_experiencia"`
	Bio              *string   `gorm:"type:text"`
	FotoURL          *string   `gorm:"column:foto_url;type:varchar(500)"`
	// Idiomas: sin catálogo cerrado (a diferencia de Especialidad) — lista
	// libre corta, jsonb alcanza y sobra.
	Idiomas        []string       `gorm:"type:jsonb;serializer:json"`
	Especialidades []Especialidad `gorm:"many2many:professional_especialidades;foreignKey:UserID;joinForeignKey:UserID;References:ID;joinReferences:EspecialidadID"`

	CreatedAt time.Time
	UpdatedAt time.Time
}

func (ProfessionalProfile) TableName() string { return "professional_profiles" }

const (
	MatriculaTipoNacional   = "nacional"
	MatriculaTipoProvincial = "provincial"
)

// Clinic reemplaza los campos NombreClinica/Slug que hoy viven directo en
// Profesional. Tipo "individual" | "organizacion" (spec §4, Paso 3) —
// revierte TR-009 (que dejaba organizaciones fuera del MVP), esta feature
// lo pide explícito.
type Clinic struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	Nombre    string    `gorm:"type:varchar(200);not null"`
	Tipo      string    `gorm:"type:varchar(20);not null;check:tipo IN ('individual','organizacion')"`
	Slug      string    `gorm:"type:varchar(220);not null;uniqueIndex"`
	Direccion *string   `gorm:"type:varchar(255)"`
	Ciudad    *string   `gorm:"type:varchar(120)"`
	Provincia *string   `gorm:"type:varchar(120)"`
	Telefono  *string   `gorm:"type:varchar(50)"`
	OwnerID   uuid.UUID `gorm:"column:owner_id;type:uuid;not null;index"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (Clinic) TableName() string { return "clinics" }

const (
	ClinicTipoIndividual   = "individual"
	ClinicTipoOrganizacion = "organizacion"
)

// ClinicMember es la pertenencia de un User a una Clinic con un rol. Al
// crear la clínica (Paso 3) el creador queda owner activo. Roles como
// constantes acá — única fuente de verdad, para que el módulo de
// invitaciones futuro (fuera de alcance, spec §9) no necesite refactor.
type ClinicMember struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ClinicID  uuid.UUID  `gorm:"column:clinic_id;type:uuid;not null;uniqueIndex:idx_clinic_member"`
	UserID    uuid.UUID  `gorm:"column:user_id;type:uuid;not null;uniqueIndex:idx_clinic_member"`
	Role      string     `gorm:"type:varchar(20);not null;check:role IN ('owner','admin','profesional','recepcion')"`
	Status    string     `gorm:"type:varchar(20);not null;default:'active';check:status IN ('active','invited')"`
	JoinedAt  *time.Time `gorm:"column:joined_at"`
	CreatedAt time.Time
}

func (ClinicMember) TableName() string { return "clinic_members" }

const (
	RoleOwner       = "owner"
	RoleAdmin       = "admin"
	RoleProfesional = "profesional"
	RoleRecepcion   = "recepcion"

	ClinicMemberStatusActive  = "active"
	ClinicMemberStatusInvited = "invited"
)

// ClinicInvitation — solo esquema y tipos (spec §9, fuera de alcance el
// envío/aceptación real). Role nunca puede ser "owner": una invitación no
// puede crear otro dueño.
type ClinicInvitation struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ClinicID        uuid.UUID  `gorm:"column:clinic_id;type:uuid;not null;index"`
	Email           string     `gorm:"type:varchar(255);not null"`
	Role            string     `gorm:"type:varchar(20);not null;check:role IN ('admin','profesional','recepcion')"`
	TokenHash       string     `gorm:"column:token_hash;type:varchar(64);not null;uniqueIndex"`
	ExpiresAt       time.Time  `gorm:"column:expires_at;not null"`
	AcceptedAt      *time.Time `gorm:"column:accepted_at"`
	InvitedByUserID uuid.UUID  `gorm:"column:invited_by_user_id;type:uuid;not null"`
	CreatedAt       time.Time
}

func (ClinicInvitation) TableName() string { return "clinic_invitations" }

// Session reemplaza al JWT stateless (jwt.go) como mecanismo de sesión —
// necesario para cumplir literal la spec §7: logout que invalida
// server-side, invalidar-todas-las-demás-sesiones en cambio de password, y
// rotación de ID de sesión en login/verificación de mail. El valor que
// viaja en la cookie es un token opaco de 32 bytes CSPRNG; acá solo se
// guarda su hash SHA-256 (mismo patrón que VerificationToken).
type Session struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	UserID    uuid.UUID `gorm:"column:user_id;type:uuid;not null;index"`
	TokenHash string    `gorm:"column:token_hash;type:varchar(64);not null;uniqueIndex"`
	CreatedAt time.Time
	// LastSeenAt: throttled — solo se reescribe si pasaron más de 5
	// minutos, para no convertir cada request protegido en un UPDATE.
	// Expiración por inactividad (7 días, spec §7) se calcula contra esta
	// columna en el momento de validar.
	LastSeenAt time.Time `gorm:"column:last_seen_at;not null"`
	// ExpiresAt: expiración absoluta (30 días, spec §7), fija desde la
	// creación de la sesión, no se extiende.
	ExpiresAt time.Time  `gorm:"column:expires_at;not null;index"`
	RevokedAt *time.Time `gorm:"column:revoked_at"`
	UserAgent string     `gorm:"column:user_agent;type:varchar(255)"`
	IP        string     `gorm:"column:ip;type:varchar(64)"`
}

func (Session) TableName() string { return "sessions" }

// AuthRateCounter es una fila-contador por (scope, key, ventana), no una
// fila por intento — evita crecimiento sin límite y no necesita cron de
// limpieza. Ver internal/ratelimit.
type AuthRateCounter struct {
	Scope       string    `gorm:"primaryKey;type:varchar(30)"`
	Key         string    `gorm:"primaryKey;type:varchar(255)"`
	WindowStart time.Time `gorm:"column:window_start;not null"`
	Count       int       `gorm:"not null;default:0"`
}

func (AuthRateCounter) TableName() string { return "auth_rate_counters" }

const (
	RateLimitScopeLogin         = "login"
	RateLimitScopeRegister      = "register"
	RateLimitScopeResendVerify  = "resend_verify"
	RateLimitScopePasswordReset = "password_reset"
	// RateLimitScopeConfirmCode — intentos de POST /auth/verificar-email
	// (TR-055 en docs/tradeoffs.md). Antes ese endpoint compartía el scope
	// "login" para su límite por IP, algo que quedó de una copia sin
	// ajustar — con un código de 6 dígitos (mucha menos entropía que el
	// token de 32 bytes anterior) hace falta su propio scope, con límite
	// por CUENTA además del de IP.
	RateLimitScopeConfirmCode = "confirm_code"
	// RateLimitScopeTurnoVerifEnviar/Confirmar — Extra 2.3.5 (E5.6): mismo
	// criterio que RateLimitScopeResendVerify/ConfirmCode de arriba, pero
	// para "Confirmanos que sos vos" del wizard público — la key acá es
	// (clinicId+email), no un userId, porque quien pide el código no tiene
	// cuenta.
	RateLimitScopeTurnoVerifEnviar    = "turno_verif_enviar"
	RateLimitScopeTurnoVerifConfirmar = "turno_verif_confirmar"
)

// AuditEvent registra eventos sensibles (spec §7: login, login fallido,
// cambio de contraseña, cambio de mail, creación de clínica, cambios de
// rol) — nunca datos sensibles ni secretos en Metadata.
type AuditEvent struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	// UserID nil: intento fallido antes de poder identificar una cuenta
	// (ej. login con un email que no existe).
	UserID    *uuid.UUID `gorm:"column:user_id;type:uuid;index"`
	EventType string     `gorm:"column:event_type;type:varchar(50);not null;index"`
	IP        string     `gorm:"type:varchar(64)"`
	UserAgent string     `gorm:"column:user_agent;type:varchar(255)"`
	Metadata  *string    `gorm:"type:jsonb"`
	CreatedAt time.Time  `gorm:"index"`
}

func (AuditEvent) TableName() string { return "audit_events" }

const (
	AuditEventLogin           = "login"
	AuditEventLoginFailed     = "login_failed"
	AuditEventPasswordChanged = "password_changed"
	AuditEventEmailChanged    = "email_changed"
	AuditEventClinicCreated   = "clinic_created"
	AuditEventRoleChanged     = "role_changed"
	AuditEventLogout          = "logout"
	AuditEventRegister        = "register"
	AuditEventEmailVerified   = "email_verified"
)
