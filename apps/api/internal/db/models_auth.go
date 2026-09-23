package db

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Modelos del nuevo sistema de auth/onboarding (docs/Login/feature-sumarte-login.md).
// Reemplazan a Profesional como dueño de la identidad — Profesional pasa a
// ser eliminado una vez que internal/http/auth.go se reescribe sobre estos
// modelos (ver el plan de implementación, decisión #2: cada Clinic tipo
// "individual" nace con el mismo UUID que tenía su Profesional de origen,
// así que turnos/pacientes/tipos_consulta/paginas_publicas — que no
// declaran una asociación GORM a Profesional, solo un campo ClinicID
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

	// CodigoInvitacion — Fase 3.2.3. El código que la persona genera para
	// que una clínica la sume al equipo ("Unirme a otra clínica" en
	// `/clinicas`). Vive en el usuario y no en la clínica porque la
	// dirección del pedido es al revés que la de una invitación: acá el
	// profesional se ofrece, y quien lo carga es la clínica (3.2.4).
	//
	// Es de UN SOLO valor vigente por persona: generar uno nuevo pisa el
	// anterior, que dejar de funcionar es justamente lo que se espera de
	// "generar otro" cuando el primero se compartió por donde no debía.
	// Vence a las 24 horas (`CodigoInvitacionExpiraAt`) — un código sin
	// vencimiento que alguien pegó en un chat sigue sirviendo un año
	// después.
	CodigoInvitacion         *string    `gorm:"column:codigo_invitacion;type:varchar(20)"`
	CodigoInvitacionExpiraAt *time.Time `gorm:"column:codigo_invitacion_expira_at"`

	// TermsAcceptedAt/TermsVersion — Ley 25.326 (spec §7): checkbox
	// explícito de ToS/privacidad al crear la cuenta, con fecha y versión.
	TermsAcceptedAt *time.Time `gorm:"column:terms_accepted_at"`
	TermsVersion    *string    `gorm:"column:terms_version;type:varchar(20)"`

	CreatedAt time.Time
	UpdatedAt time.Time
	// DeletedAt: soft delete — mecanismo "previsto" para el borrado de
	// cuenta que pide Ley 25.326 (spec §7); no hay todavía un flujo
	// self-service de borrado, ver docs/Arquitectura y base/tradeoffs.md.
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
// contra el catálogo global Especialidad (TR-004 en docs/Arquitectura y base/tradeoffs.md, sin
// cambios) — solo cambia la tabla puente, de profesional_especialidades a
// professional_especialidades, con FK a user_id en vez de clinic_id.
type ProfessionalProfile struct {
	UserID uuid.UUID `gorm:"column:user_id;type:uuid;primaryKey"`
	// TipoPerfil — Fase 3.2.3 (ronda de QA del 2026-09-13). No todo el que
	// entra a la app atiende pacientes: un recepcionista o quien edita la
	// página de la clínica **no tiene matrícula**, y hasta acá el alta se
	// la pedía como obligatoria. Con las invitaciones por mail (Fase
	// 3.2.4) esa persona va a tener que crearse una cuenta, así que el
	// requisito pasaba de molesto a bloqueante.
	//
	// Con `actividades`, matrícula y especialidades quedan vacías y no se
	// piden. El default es `profesional` para que las filas que ya existen
	// —todas, de odontólogos— sigan significando lo mismo.
	TipoPerfil       string  `gorm:"column:tipo_perfil;type:varchar(20);not null;default:'profesional';check:tipo_perfil IN ('profesional','actividades')"`
	Nombre           string  `gorm:"type:varchar(150);not null"`
	Apellido         string  `gorm:"type:varchar(150);not null"`
	TelefonoPrefijo  string  `gorm:"column:telefono_prefijo;type:varchar(6);not null;default:'+54'"`
	Telefono         string  `gorm:"type:varchar(50);not null"`
	Documento        *string `gorm:"type:varchar(20)"`
	MatriculaTipo    string  `gorm:"column:matricula_tipo;type:varchar(20);not null;default:'';check:matricula_tipo IN ('','nacional','provincial')"`
	MatriculaNumero  string  `gorm:"column:matricula_numero;type:varchar(50);not null;default:''"`
	AniosExperiencia *int    `gorm:"column:anios_experiencia"`
	Bio              *string `gorm:"type:text"`
	FotoURL          *string `gorm:"column:foto_url;type:varchar(500)"`
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

const (
	// PerfilTipoProfesional — atiende pacientes. Matrícula y al menos una
	// especialidad son obligatorias.
	PerfilTipoProfesional = "profesional"
	// PerfilTipoActividades — trabaja en la clínica sin atender:
	// recepción, o la administración de la página. Sin matrícula ni
	// especialidades.
	PerfilTipoActividades = "actividades"
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
	// HorarioClinicaNota acompaña al horario del edificio (PE-6). Se guarda
	// en la clínica porque es una nota única para toda la semana, no una
	// propiedad de cada franja ni del horario individual de un profesional.
	HorarioClinicaNota string    `gorm:"column:horario_clinica_nota;type:varchar(160);not null;default:''"`
	OwnerID            uuid.UUID `gorm:"column:owner_id;type:uuid;not null;index"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
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
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ClinicID uuid.UUID `gorm:"column:clinic_id;type:uuid;not null;uniqueIndex:idx_clinic_member"`
	// UserID — corrección de performance (auditoría 2026-09-08, docs/
	// Seguridad y optimizacion/radiografia-tecnica_1.md): requireClinic
	// (middleware.go) resuelve la Clinic del usuario autenticado con
	// `WHERE user_id = ? AND role = ?` en CADA request al panel — el único
	// índice que existía acá (idx_clinic_member, uniqueIndex) es compuesto
	// (clinic_id, user_id), con user_id como columna NO líder, así que esa
	// consulta no lo aprovechaba bien (sequential scan silencioso con
	// muchas clínicas). Este índice nuevo, con user_id como líder, es
	// justo el que esa query necesita — hoy con pocas filas la diferencia
	// no se nota, pero es la mejora de mejor relación impacto/esfuerzo de
	// toda la auditoría.
	UserID uuid.UUID `gorm:"column:user_id;type:uuid;not null;uniqueIndex:idx_clinic_member;index:idx_clinic_member_user_role,priority:1"`
	// Status — Fase 3.2.1: suma "removed". La membresía NO SE BORRA NUNCA,
	// se marca. El motivo es la foreign key compuesta de `turnos`
	// (clinic_id, atendido_por_user_id) → clinic_members (clinic_id,
	// user_id): si la fila se borrara, esa FK bloquearía la baja de
	// cualquier profesional con historial. Marcarla deja a la clínica sin
	// darle acceso y al historial intacto y auditable.
	Status    string     `gorm:"type:varchar(20);not null;default:'active';check:status IN ('active','invited','removed')"`
	JoinedAt  *time.Time `gorm:"column:joined_at"`
	CreatedAt time.Time
	// AvalPaginaPublica es el consentimiento afirmativo y propio de esta
	// persona para esta clínica. Apagado por defecto: aparecer en una página
	// pública nunca se hereda de la membresía ni del rol.
	AvalPaginaPublica bool       `gorm:"column:aval_pagina_publica;not null;default:false"`
	AvalPaginaEn      *time.Time `gorm:"column:aval_pagina_en"`

	// Roles — la columna `role` (una sola, con check constraint) vivió acá
	// hasta la Fase 3.2.1. El brief del multi-tenant pide tratarlos como
	// tags acumulables: el titular es profesional Y administrador de página
	// a la vez. Eso no cabe en una columna, así que pasó a ser una tabla.
	// Ver ClinicMemberRole abajo.
	Roles []ClinicMemberRole `gorm:"foreignKey:ClinicMemberID"`
}

func (ClinicMember) TableName() string { return "clinic_members" }

// ClinicMemberRole — un rol de un miembro dentro de una clínica. Varios por
// miembro: el brief los pide como tags, no como una elección única.
//
// LA REGLA DE EXCLUSIÓN NO ESTÁ ACÁ, ESTÁ EN EL MOTOR. `recepcion` es
// excluyente con `profesional` (un recepcionista no atiende pacientes), y
// eso se declara con un índice único PARCIAL, creado en migrate.go:
//
//	CREATE UNIQUE INDEX idx_rol_excluyente ON clinic_member_roles (clinic_member_id)
//	  WHERE rol IN ('profesional', 'recepcion');
//
// Con eso, `admin` y `owner` se suman libremente pero nadie puede ser
// profesional y recepcionista a la vez — probado en las dos direcciones. Es
// el mismo criterio que el no-solapamiento de turnos (spec §4.3): una regla
// que no se puede violar no se valida en la aplicación, se declara en el
// esquema.
type ClinicMemberRole struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ClinicMemberID uuid.UUID `gorm:"column:clinic_member_id;type:uuid;not null;uniqueIndex:idx_rol_por_miembro,priority:1"`
	Rol            string    `gorm:"column:rol;type:varchar(20);not null;check:rol IN ('owner','admin','profesional','recepcion');uniqueIndex:idx_rol_por_miembro,priority:2"`
	CreatedAt      time.Time
}

func (ClinicMemberRole) TableName() string { return "clinic_member_roles" }

const (
	RoleOwner       = "owner"
	RoleAdmin       = "admin"
	RoleProfesional = "profesional"
	RoleRecepcion   = "recepcion"

	ClinicMemberStatusActive  = "active"
	ClinicMemberStatusInvited = "invited"
	// ClinicMemberStatusRemoved — Fase 3.2.1: la salida de un colaborador
	// se marca, no se borra (ver el comentario de ClinicMember.Status).
	ClinicMemberStatusRemoved = "removed"
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

	// ViendoUserID — EL PROFESIONAL EN FOCO (Fase 3.2.6).
	//
	// Solo lo usa `recepcion`, que es el único rol que ve la clínica
	// entera: es "la vista de quién estoy mirando ahora". Nil significa
	// la VISTA GENERAL —todos los turnos de todos los profesionales, las
	// métricas de la clínica—, y con un profesional puesto la sesión se
	// comporta exactamente como él en los seis scopes de visibilidad.
	//
	// Un solo concepto en vez de una vista paralela: el brief pide que
	// recepción tenga "acceso a todas las vistas de los N profesionales"
	// e interactúe con ellas, no una pantalla distinta. Poniendo el foco
	// en `visibilidad.go` —el único lugar donde ya se decidía qué ve
	// cada uno— las cuatro pantallas del panel funcionan sin tocar
	// ninguna de sus 25 consultas. El comentario de ese archivo ya lo
	// anticipaba: "un solo lugar que cambiar cuando la Fase 3.2.6 sume
	// la vista del recepcionista por profesional".
	//
	// Vive en la SESIÓN, igual que ClinicID y por el mismo motivo: es
	// dónde estoy parado ahora, no una preferencia de la cuenta. El
	// costo aceptado es que dos pestañas del mismo navegador comparten el
	// foco; la alternativa (llevarlo en la URL) obligaría a enhebrarlo
	// por cada Server Action del BFF, que no ve la URL.
	//
	// Sin foreign key, igual que ClinicID: una sesión vieja apuntando a
	// alguien que ya no está en el equipo no puede romper nada — el
	// middleware la valida contra la membresía activa en cada request, y
	// si no da, cae a la vista general.
	ViendoUserID *uuid.UUID `gorm:"column:viendo_user_id;type:uuid"`

	// ClinicID — la clínica elegida en "¿Dónde trabajás hoy?" (Fase
	// 3.2.3). Nil mientras no se eligió ninguna, y ahí `requireClinic`
	// vuelve al criterio de la 3.2.2 (la membresía activa más antigua).
	//
	// Vive en la SESIÓN y no en el usuario a propósito: es una elección
	// de "dónde estoy trabajando ahora", no una preferencia de la cuenta.
	// Dos sesiones abiertas —el consultorio y el celular— pueden estar en
	// clínicas distintas sin pisarse, que es exactamente lo que hace un
	// profesional que atiende en dos lugares el mismo día.
	//
	// Que apunte a una clínica no alcanza para entrar: `requireClinic`
	// revalida la membresía en cada request. Si a la persona la sacaron
	// del equipo, la elección guardada deja de valer sola.
	ClinicID *uuid.UUID `gorm:"column:clinic_id;type:uuid;index"`
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
	// (TR-055 en docs/Arquitectura y base/tradeoffs.md). Antes ese endpoint compartía el scope
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
	// RateLimitScopeMisTurnosConsulta — pedido textual del cliente:
	// botón "Mis turnos" de la página pública (misTurnosPublicoHandler),
	// consulta por DNI+mail sin verificación de código — por IP, para
	// que probar combinaciones de DNI al voleo no sea gratis.
	RateLimitScopeMisTurnosConsulta = "mis_turnos_consulta"
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
	// Fase 3.2.4 — el equipo de la clínica. Quién invitó a quién y quién
	// aceptó es exactamente lo que hay que poder reconstruir el día que
	// alguien pregunte por qué una persona tenía acceso a una agenda.
	AuditEventColaboradorInvitado = "colaborador_invitado"
	AuditEventColaboradorAceptado = "colaborador_aceptado"
	AuditEventColaboradorQuitado  = "colaborador_quitado"
)

// ConRol — scope de GORM para filtrar miembros por uno de sus roles.
//
// Desde la Fase 3.2.1 el rol no es una columna de `clinic_members` sino
// filas en `clinic_member_roles`, así que "el owner de esta clínica" pasó
// de ser `WHERE role = 'owner'` a una condición de existencia. Vive acá
// para que los seis lugares que preguntan por un rol no repitan el mismo
// EXISTS —y sobre todo para que el día que los permisos se vuelvan
// interesantes (Fase 3.2.2) haya un solo lugar que cambiar—.
//
// Uso: gdb.Scopes(db.ConRol(db.RoleOwner)).Where("user_id = ?", id).First(&m)
func ConRol(rol string) func(*gorm.DB) *gorm.DB {
	return func(tx *gorm.DB) *gorm.DB {
		return tx.Where(`EXISTS (
			SELECT 1 FROM clinic_member_roles r
			WHERE r.clinic_member_id = clinic_members.id AND r.rol = ?
		)`, rol)
	}
}

// AsignarRol le suma un rol a un miembro. Idempotente: repetirlo no
// duplica (idx_rol_por_miembro). Si el rol choca con la regla de exclusión
// —intentar `recepcion` sobre alguien que ya es `profesional`— el índice
// parcial lo rechaza y el error llega desde el motor, que es donde tiene
// que estar esa decisión.
func AsignarRol(tx *gorm.DB, clinicMemberID uuid.UUID, rol string) error {
	return tx.Exec(`INSERT INTO clinic_member_roles (id, clinic_member_id, rol, created_at)
		VALUES (gen_random_uuid(), ?, ?, now())
		ON CONFLICT (clinic_member_id, rol) DO NOTHING`, clinicMemberID, rol).Error
}

// jerarquiaDeRoles — de mayor a menor alcance, para elegir cuál mostrar
// cuando hay que mostrar uno solo.
var jerarquiaDeRoles = []string{RoleOwner, RoleAdmin, RoleProfesional, RoleRecepcion}

// RolPrincipal — el de mayor alcance de un miembro.
//
// Existe porque los roles pasaron a ser acumulables pero varias pantallas
// (y el JSON de /me) siguen mostrando UNO. Devuelve "" si no hay ninguno,
// que es un estado posible: un miembro invitado que todavía no aceptó.
func RolPrincipal(roles []ClinicMemberRole) string {
	tiene := make(map[string]bool, len(roles))
	for _, r := range roles {
		tiene[r.Rol] = true
	}
	for _, rol := range jerarquiaDeRoles {
		if tiene[rol] {
			return rol
		}
	}
	return ""
}

// OwnerDeLaClinica devuelve el user del owner de una clínica.
//
// Fase 3.2.1: todo turno tiene que decir quién lo atiende
// (chk_turno_agendado_profesional), y hasta que el wizard y el panel dejen
// elegir profesional —Fases 3.2.6 y 3.2.7— ese alguien es el owner, que es
// el único profesional que cada clínica tiene hoy. Es exactamente el
// comportamiento anterior a la fase, cuando la clínica ERA el profesional;
// lo único que cambia es que ahora queda escrito en la fila en vez de
// estar implícito.
//
// Cuando esas fases lleguen, los call sites pasan a recibir el profesional
// elegido y esta función queda para los casos sin elección explícita.
func OwnerDeLaClinica(tx *gorm.DB, clinicID uuid.UUID) (uuid.UUID, error) {
	var crudo string
	err := tx.Raw(`SELECT m.user_id::text FROM clinic_members m
		JOIN clinic_member_roles r ON r.clinic_member_id = m.id AND r.rol = ?
		WHERE m.clinic_id = ?`, RoleOwner, clinicID).Scan(&crudo).Error
	if err != nil {
		return uuid.Nil, err
	}
	if crudo == "" {
		return uuid.Nil, fmt.Errorf("la clínica %s no tiene un owner activo", clinicID)
	}
	return uuid.Parse(crudo)
}
