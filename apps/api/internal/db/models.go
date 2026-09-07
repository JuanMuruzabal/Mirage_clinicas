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
	// Telefono — Fase 2.4.2 (`docs/FASE 2.4 - detallada y bien
	// especificada.docx`, sección "para otro"): pasa de NOT NULL a
	// nullable — el documento pide explícitamente que, cuando el turno lo
	// saca un tutor para otra persona, el teléfono (y el mail) DEL
	// PACIENTE queden opcionales (a diferencia de "para mí", donde uno de
	// los 2 ya es obligatorio). La migración solo relaja el constraint
	// (`ALTER COLUMN ... DROP NOT NULL`, migrate.go) — ningún dato
	// existente se pierde, todas las filas ya tenían un valor no vacío.
	Telefono *string `gorm:"type:varchar(30)"`
	Email    *string `gorm:"type:varchar(255)"`
	// Sexo/Edad — Fase 2.4.1 (`docs/FASE 2.4 - detallada y bien
	// especificada.docx`): datos que pide el wizard público en el camino
	// "para mí, primera vez" — el documento los menciona sin marcarlos
	// obligatorios ("DNI, teléfono... mail... edad, sexo, etc."), a
	// diferencia de DNI/teléfono/mail (que sí tienen regla explícita:
	// "obligatorio alguno de los 2"). Quedan nullable a propósito, nunca
	// bloquean el wizard si el paciente no los completa.
	Sexo *string `gorm:"type:varchar(20)"`
	Edad *int    `gorm:"column:edad"`
	// EnConflicto — Fase 2.4.1: una ficha nueva creada a propósito con un
	// DNI que YA existe, porque el mail no coincide con el de la ficha
	// verificada (ver crearPacientePublicoConDeteccionDeConflicto,
	// pacientes_conflicto_publico.go) — el documento del cliente pide
	// dejar pasar el turno y avisar, nunca bloquear. `idx_paciente_dni_unico`
	// (TR-100) pasa a ser un índice PARCIAL (`WHERE NOT en_conflicto`,
	// migrate.go) para permitir esta convivencia temporaria sin romper la
	// garantía de unicidad para el resto de las fichas normales — se
	// resuelve borrando esta fila (si el mail no era de la persona
	// verificada) o migrándola (si sí lo era), nunca queda EnConflicto
	// para siempre. Cualquier búsqueda de paciente POR DNI (nunca por ID)
	// que no sea la propia pantalla de conflictos debe filtrar
	// `en_conflicto = false`, para no toparse con esta ficha temporaria.
	EnConflicto bool `gorm:"column:en_conflicto;not null;default:false"`
	// Origen — Fase 2.4.1, pedido explícito del cliente: una ficha que el
	// PROFESIONAL crea a mano (crearPacienteHandler, "+ Agregar
	// paciente"; o crearOBuscarPacientePorDNI, "Agregar turno" con
	// paciente nuevo) queda VERIFICADA de entrada — el profesional vio a
	// esa persona para cargarla, no hace falta esperar a que complete un
	// turno para confiar en el DNI. Mismos valores que Turno.Origen
	// ('pagina_publica'/'manual'), pero es un campo propio: la fuente de
	// verdad de "quién creó esta ficha" tiene que sobrevivir aunque el
	// turno que la originó se cancele/borre después. Ver
	// pacienteEstaVerificado (paciente_verificado_publico.go).
	Origen    string `gorm:"type:varchar(20);not null;default:pagina_publica;check:origen IN ('pagina_publica','manual')"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (Paciente) TableName() string { return "pacientes" }

// PacienteTutor — Fase 2.4.2 (`docs/FASE 2.4 - detallada y bien
// especificada.docx`, camino "sacar turno para otro"), rediseñado en la
// ronda de correcciones del 2026-09-06: un paciente puede tener MÁS DE UN
// tutor a lo largo del tiempo (mamá reservó primero, después papá, después
// una abuela...) — antes esto vivía como 5 columnas nullable directo en
// `Paciente` (un único tutor), reemplazadas por esta tabla uno-a-muchos,
// mismo patrón que `PacienteEmailAlternativo`/`PacienteTelefonoAlternativo`.
// Cada fila es un tutor CONOCIDO/confirmado para ese paciente — se crea al
// dar de alta la ficha por este camino (crearFichaPacientePublico,
// crearOBuscarPacientePorDNI) y se suma una fila más cuando un conflicto
// "tutor nuevo vs. tutor(es) ya confirmado(s)" se resuelve a favor de que
// es el mismo paciente (resolverConflictoComoVerdadero) — nunca se
// descarta un tutor anterior al sumar uno nuevo.
//
// `Turno.Tutor*` (más abajo, sin cambios) sigue siendo el snapshot de
// quién reservó ESE turno puntual — eso nunca fue plural, cada turno tiene
// exactamente un tutor que lo sacó.
//
// Sin DNI (tercera ronda de correcciones, 2026-09-06, pedido textual del
// cliente: "sigue pidiendo DNI 'para otro'... sacarlo del todo, no es tan
// útil y agrega complejidad") — la columna existió hasta esta ronda, pero
// se eliminó del todo junto con la validación "el DNI del tutor no puede
// ser igual al del paciente" (que dependía de ella) en los 3 lugares que
// pedían este dato: wizard público, "+ Agregar paciente" y "Agregar
// turno" del calendario. La identidad del tutor para detección de
// conflicto/reuso sigue siendo el Email (ver más abajo) — nunca dependió
// del DNI.
type PacienteTutor struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	// PacienteID — índice único COMPUESTO (paciente_id, email), mismo
	// motivo que PacienteEmailAlternativo: el mismo mail de tutor puede
	// repetirse legítimamente entre pacientes distintos (hermanos con el
	// mismo profesional, cada uno su propia ficha) sin chocar.
	PacienteID uuid.UUID `gorm:"column:paciente_id;type:uuid;not null;uniqueIndex:idx_paciente_tutor"`
	// Relacion — select acotado (`familiar`/`amigo`/`otro`, check
	// constraint en migrate.go), no texto libre — así lo pide el
	// documento original.
	Relacion string `gorm:"type:varchar(20);not null"`
	Nombre   string `gorm:"type:varchar(150);not null"`
	Telefono string `gorm:"type:varchar(30);not null"`
	// Email — el campo que identifica a ESTE tutor para la detección de
	// conflicto y el camino "ya he venido antes" (ver
	// pacienteTieneTutorConMail, paciente_verificado_publico.go) — nunca
	// se compara contra `Paciente.Email` (el mail propio del paciente,
	// casi siempre vacío en este camino).
	Email     string `gorm:"type:varchar(255);not null;uniqueIndex:idx_paciente_tutor"`
	CreatedAt time.Time
}

func (PacienteTutor) TableName() string { return "paciente_tutores" }

// PacienteTutorTelefonoAlternativo — cuarta ronda de correcciones
// (2026-09-06), pedido textual del cliente: "si un tutor vuelve a sacar
// turno con mismo mail, diferente teléfono, añadir ese teléfono al tutor
// del mail correspondiente" — corregido acá: "añadir" es literal, se
// ACUMULA (mismo criterio que `PacienteTelefonoAlternativo` del paciente),
// no se reemplaza el teléfono principal del tutor. El mail sigue siendo
// la identidad del tutor (columna `Telefono` de `PacienteTutor` no
// cambia, sigue siendo el primero/principal); esta tabla solo suma los
// que aparecen después.
type PacienteTutorTelefonoAlternativo struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	// PacienteTutorID — índice único compuesto (paciente_tutor_id,
	// telefono), mismo motivo que PacienteTelefonoAlternativo: no
	// duplicar el mismo alternativo para el mismo tutor.
	PacienteTutorID uuid.UUID `gorm:"column:paciente_tutor_id;type:uuid;not null;uniqueIndex:idx_paciente_tutor_telefono_alt"`
	Telefono        string    `gorm:"type:varchar(30);not null;uniqueIndex:idx_paciente_tutor_telefono_alt"`
	CreatedAt       time.Time
}

func (PacienteTutorTelefonoAlternativo) TableName() string {
	return "paciente_tutor_telefonos_alternativos"
}

// PacienteEmailAlternativo — Fase 2.4.1: un mail migrado a un Paciente ya
// VERIFICADO al resolver un conflicto de pacientes con el botón "el mail
// es de la persona verificada" (ver internal/http/pacientes_conflictos.go)
// — desde ese momento el paciente puede volver a pedir un turno
// verificándose con CUALQUIERA de sus mails: el principal (Paciente.Email)
// o cualquiera de estos. Tabla aparte en vez de convertir Paciente.Email
// en una lista: la enorme mayoría de los pacientes nunca tiene un
// conflicto, y todo el código existente ya lee Paciente.Email como un
// *string simple — no vale la pena romper eso por un caso de borde.
type PacienteEmailAlternativo struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	// PacienteID — corrección de QA: el índice único es COMPUESTO
	// (paciente_id, email), no solo sobre Email. Con el índice viejo
	// (Email solo), el mismo dato de contacto quedaba "reservado"
	// globalmente para el primer paciente que lo hubiera tenido como
	// alternativo — cualquier otro paciente distinto que necesitara ese
	// mismo mail como alternativo (dato de prueba repetido entre
	// pacientes, o coincidencia real) chocaba con un 500 al resolver su
	// conflicto, sin haber repetido nada de su lado. El prefijo
	// (paciente_id) de este índice compuesto ya cubre los lookups por
	// paciente (pacienteRespondeAlMail) — no hace falta un `index` aparte.
	PacienteID uuid.UUID `gorm:"column:paciente_id;type:uuid;not null;uniqueIndex:idx_paciente_email_alt"`
	Email      string    `gorm:"type:varchar(255);not null;uniqueIndex:idx_paciente_email_alt"`
	CreatedAt  time.Time
}

func (PacienteEmailAlternativo) TableName() string { return "paciente_emails_alternativos" }

// PacienteTelefonoAlternativo — Fase 2.4.1, corrección de QA: mismo
// motivo/patrón que PacienteEmailAlternativo, pero para el teléfono de la
// ficha en conflicto — pedido explícito del cliente: al resolver "el mail
// es de la persona verificada", también se suma el teléfono que traía esa
// ficha (no solo el mail). El panel muestra "Ver teléfonos →" en la ficha
// del paciente cuando hay más de uno (mismo criterio que "Ver mails →").
type PacienteTelefonoAlternativo struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	// PacienteID — mismo índice compuesto (paciente_id, telefono) que
	// PacienteEmailAlternativo, mismo motivo (corrección de QA).
	PacienteID uuid.UUID `gorm:"column:paciente_id;type:uuid;not null;uniqueIndex:idx_paciente_telefono_alt"`
	Telefono   string    `gorm:"type:varchar(30);not null;uniqueIndex:idx_paciente_telefono_alt"`
	CreatedAt  time.Time
}

func (PacienteTelefonoAlternativo) TableName() string { return "paciente_telefonos_alternativos" }

// ConflictoPaciente — Fase 2.4.1: dos fichas de `Paciente` compitiendo por
// el mismo DNI con datos de contacto distintos, cuando la ficha ya
// existente está VERIFICADA (tuvo al menos un turno resuelto y asistido —
// se calcula al vuelo, nunca una columna, mismo criterio que "resuelto"
// en TurnosTable/TurnoDetalle, TR-074). Mientras `Resuelto = false`, el
// profesional ve las dos fichas + el turno recién creado en
// `/panel/pacientes` (banner de conflicto, mismo lenguaje visual que el
// del calendario, TR-095) y elige con cuál de las dos se queda.
type ConflictoPaciente struct {
	ID                    uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID         uuid.UUID `gorm:"column:profesional_id;type:uuid;not null;index"`
	PacienteVerificadoID  uuid.UUID `gorm:"column:paciente_verificado_id;type:uuid;not null"`
	PacienteEnConflictoID uuid.UUID `gorm:"column:paciente_en_conflicto_id;type:uuid;not null"`
	TurnoEnConflictoID    uuid.UUID `gorm:"column:turno_en_conflicto_id;type:uuid;not null"`
	Motivo                string    `gorm:"type:text;not null"`
	Resuelto              bool      `gorm:"not null;default:false"`
	CreatedAt             time.Time
}

func (ConflictoPaciente) TableName() string { return "conflictos_paciente" }

// EmailBloqueadoTurnoPublico — Fase 2.4.1: pedido textual del cliente —
// "bloquear su mail por una semana para que no lo pueda volver a usar
// para sacar ningún tipo de turno", al resolver un conflicto de
// pacientes con "el mail NO es de la persona verificada". Tabla propia
// (no una columna en `Paciente`) porque la ficha que originó el bloqueo
// se BORRA como parte de esa misma resolución — el bloqueo tiene que
// sobrevivir a ese borrado.
type EmailBloqueadoTurnoPublico struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID  uuid.UUID `gorm:"column:profesional_id;type:uuid;not null;index:idx_email_bloqueado,priority:1"`
	Email          string    `gorm:"type:varchar(255);not null;index:idx_email_bloqueado,priority:2"`
	BloqueadoHasta time.Time `gorm:"column:bloqueado_hasta;not null"`
	CreatedAt      time.Time
}

func (EmailBloqueadoTurnoPublico) TableName() string { return "emails_bloqueados_turno_publico" }

// IPBloqueadaTurnoPublico — corrección de seguridad (Fase 2.4.1), pedido
// textual del cliente: "este tipo de infractor [mail con muchos DNIs
// distintos] bloquea la IP para que no vulnere con el otro tipo de
// caminos [rotación de mails y DNI]" — mismo mecanismo y forma que
// EmailBloqueadoTurnoPublico, tabla propia por el mismo motivo (la ficha/
// turno que originó el bloqueo puede borrarse, el bloqueo tiene que
// sobrevivir). OJO: una IP es una señal MUCHO más débil que un mail
// verificado — compartida por CGNAT/wifi, rota gratis con VPN — ver el
// comentario grande sobre clientIP en auth.go. Por eso la duración de
// este bloqueo es más corta que la de un mail (bloqueoIPDuracion, turno_
// publico.go): más barato de que se le pegue a un vecino de mala suerte
// en la misma red, mejor que dure poco.
type IPBloqueadaTurnoPublico struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID  uuid.UUID `gorm:"column:profesional_id;type:uuid;not null;index:idx_ip_bloqueada,priority:1"`
	IP             string    `gorm:"type:varchar(64);not null;index:idx_ip_bloqueada,priority:2"`
	BloqueadoHasta time.Time `gorm:"column:bloqueado_hasta;not null"`
	CreatedAt      time.Time
}

func (IPBloqueadaTurnoPublico) TableName() string { return "ips_bloqueadas_turno_publico" }

// AuditoriaBloqueoTurnoPublico — corrección de seguridad (Fase 2.4.1),
// pedido textual del cliente: "el apartado de auditoría de turnos de
// bloqueos, donde muestre los mails bloqueados etc, por las dudas de
// algún malentendido". A diferencia de EmailBloqueadoTurnoPublico/
// IPBloqueadaTurnoPublico (que solo dicen "está bloqueado hasta tal
// fecha"), esta es la bitácora de POR QUÉ se bloqueó algo y QUÉ se borró
// — los turnos en sí ya no existen (se eliminan de verdad, no se
// cancelan, ver bloquearMailPorAbusoDeDNIsYBorrarTurnos), así que sin
// este registro no quedaría ningún rastro para que el profesional
// revise un posible falso positivo.
type AuditoriaBloqueoTurnoPublico struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ProfesionalID uuid.UUID `gorm:"column:profesional_id;type:uuid;not null;index"`
	// Motivo: "mail_muchos_dnis" | "ip_rotacion" | "dni_tipo_tope" — qué
	// detector disparó esto. "dni_tipo_tope" (modo simulado únicamente,
	// ver Simulado abajo) es el tope de turnos sin verificar por DNI+tipo
	// de consulta — a diferencia de los otros dos, ese detector NUNCA
	// bloquea ni borra nada de verdad, solo rechaza el pedido (409) — por
	// eso solo genera fila de auditoría cuando SimularBloqueosSeguridad
	// está prendido, para poder ver en el panel que se habría rechazado.
	Motivo string  `gorm:"type:varchar(30);not null;check:motivo IN ('mail_muchos_dnis','ip_rotacion','dni_tipo_tope')"`
	Email  *string `gorm:"type:varchar(255)"`
	IP     *string `gorm:"type:varchar(64)"`
	// DNIs — lista separada por coma (sin tabla hija aparte, es solo para
	// lectura humana en el panel, nunca se vuelve a parsear para lógica).
	DNIs           string `gorm:"column:dnis;type:text;not null"`
	TurnosBorrados int    `gorm:"column:turnos_borrados;not null;default:0"`
	// Simulado (corrección de seguridad, Fase 2.4.1) — pedido textual del
	// cliente: "estoy probando en localhost, no bloquearme realmente,
	// sino decirme que debería estar bloqueado". En local (sin
	// RESEND_API_KEY, ver AuthDeps.SimularBloqueosSeguridad) esta fila se
	// crea igual pero el mail/IP NUNCA se bloquea de verdad y ningún
	// turno se borra — queda como registro de "acá se habría disparado
	// esto" para poder verificar que la lógica de detección funciona sin
	// pagar el costo de un bloqueo real mientras se prueba.
	Simulado  bool `gorm:"not null;default:false"`
	CreatedAt time.Time
}

func (AuditoriaBloqueoTurnoPublico) TableName() string { return "auditoria_bloqueos_turno_publico" }

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

// EnlaceTurno — Fase 2, ítem 5 ("compartir calendario"): el profesional ya
// habló con el paciente por teléfono/en persona y solo necesita mandarle un
// link para que termine de elegir día y horario — sin pasar por CAPTCHA ni
// "Confirmanos que sos vos" (el profesional ya demostró esa identidad por
// otro medio), pero SIN perder la detección de conflictos de identidad ni
// el tope universal de 1 turno activo por DNI (esos son reglas de negocio,
// no anti-abuso — siguen aplicando igual). Generado desde "+ Agregar
// turno" → "Compartir link de turnero" (panel, autenticado); consumido
// desde el wizard público de siempre, que se abre directo en el paso de
// datos salteando por completo la pantalla de código.
//
// Vencimiento — dos mecanismos independientes, el que llegue primero:
//  1. ExpiraEn: 1 hora desde que se generó, sin importar cuántos turnos se
//     hayan sacado con él todavía.
//  2. Límite de usos, dinámico según lo que la propia persona elija en la
//     pantalla "¿Para quién es el turno?" del wizard en cada intento (el
//     profesional no lo fija al generar el link — pedido explícito del
//     cliente): UsadoParaMi pasa a `true` en cuanto se saca UN turno "para
//     mí" con este link, y a partir de ahí el link queda muerto para
//     cualquier uso posterior (de cualquier tipo) — un link "para mí" es
//     para una sola persona. UsosParaOtro cuenta cuántos turnos "para
//     otro" ya se sacaron, tope `EnlaceTurnoLimiteUsosParaOtro` (5) — un
//     tutor real puede tener varios hijos para anotar con el mismo link.
type EnlaceTurno struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	// ProfesionalID — mismo nombre histórico que Turno.ProfesionalID/
	// TipoConsulta.ProfesionalID en todo este archivo: en realidad
	// referencia Clinic.ID, nunca cambiado por no romper el resto del
	// esquema ya en producción.
	ProfesionalID uuid.UUID `gorm:"column:profesional_id;type:uuid;not null;index"`
	TokenHash     string    `gorm:"column:token_hash;type:varchar(64);not null;uniqueIndex"`
	ExpiraEn      time.Time `gorm:"column:expira_en;not null"`
	UsadoParaMi   bool      `gorm:"column:usado_para_mi;not null;default:false"`
	UsosParaOtro  int       `gorm:"column:usos_para_otro;not null;default:0"`
	CreatedAt     time.Time
}

func (EnlaceTurno) TableName() string { return "enlaces_turno" }

// EnlaceTurnoLimiteUsosParaOtro — ver el comentario grande de EnlaceTurno.
const EnlaceTurnoLimiteUsosParaOtro = 5

// EnlaceTurnoVigente — true mientras quede AL MENOS un camino posible
// (no venció por tiempo, y "para mí" o "para otro" todavía tienen cupo) —
// usado tanto por el chequeo previo del wizard (¿vale la pena mostrar el
// formulario?) como, indirectamente, por la validación real al confirmar
// el turno.
func (e EnlaceTurno) Vigente(ahora time.Time) bool {
	if ahora.After(e.ExpiraEn) {
		return false
	}
	paraMiDisponible := !e.UsadoParaMi
	paraOtroDisponible := e.UsosParaOtro < EnlaceTurnoLimiteUsosParaOtro
	return paraMiDisponible || paraOtroDisponible
}

// Turno es la pieza central del esquema (spec §4.3/§4.4). El estado
// `pendiente` (turno del formulario público sin horario fijo todavía,
// TR-006) existió hasta Extra 2.3.5 — el formulario público ahora asigna
// horario real de entrada (TR-100), así que todo turno nace `agendado` de
// punta a punta; `pendiente` se sacó del todo (Extra 2.3.3, TR-104):
// nunca más un valor válido de `Estado`, ni en el check constraint ni en
// ningún código que lo use.
type Turno struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	// ProfesionalID — corrección de performance (N clínicas, cada una con su
	// propio historial creciendo con los años): además del índice simple de
	// siempre, suma 3 índices compuestos con las columnas que los
	// detectores de abuso de turno_publico.go filtran junto con
	// profesional_id (email_contacto/dni_contacto/ip_contacto, ninguna
	// indexada por su cuenta) — hoy Postgres ya achica rápido por
	// profesional_id solo y filtra el resto en memoria porque cada clínica
	// tiene pocas filas, pero eso deja de ser gratis si UNA clínica
	// puntual acumula muchos años de turnos.
	ProfesionalID  uuid.UUID  `gorm:"column:profesional_id;type:uuid;not null;index;index:idx_turno_prof_email,priority:1;index:idx_turno_prof_dni,priority:1;index:idx_turno_prof_ip,priority:1"`
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
	DNIContacto      string `gorm:"column:dni_contacto;type:varchar(20);not null;index:idx_turno_prof_dni,priority:2"`
	TelefonoContacto string `gorm:"column:telefono_contacto;type:varchar(30);not null"`
	EmailContacto    string `gorm:"column:email_contacto;type:varchar(255);not null;index:idx_turno_prof_email,priority:2"`
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

	// IPContacto (corrección de seguridad, Fase 2.4.1) — la IP del pedido,
	// SOLO para turnos `pagina_publica` (nil en los `manual`, que no tienen
	// noción de "IP del caller" — los crea el profesional autenticado
	// desde el panel). Existe para detectar el patrón "mismo mail y DNI
	// nunca repetidos, pero desde la misma IP en poco tiempo" —
	// ipRotacionDeteccion en turno_publico.go — que ni el tope por DNI ni
	// el tope por mail alcanzan a ver solos. Nunca se usa para identificar
	// a una persona con certeza (ver el comentario grande sobre
	// clientIP en auth.go): es una señal más, débil y compartida
	// (CGNAT/wifi), no una huella confiable.
	IPContacto *string `gorm:"column:ip_contacto;type:varchar(64);index:idx_turno_prof_ip,priority:2"`

	// EsParaOtro/Tutor* — Fase 2.4.2, camino "sacar turno para otro": a
	// diferencia de los campos Contacto de arriba (que SIGUEN siendo el
	// paciente, sin cambio de significado — ver el comentario grande en
	// docs/ArquitecturaPeticionesTurno.md Parte 3 sobre por qué), este es
	// un set PARALELO con el snapshot de quien reservó en nombre del
	// paciente. Mismo criterio que NombreContacto/ApellidoContacto: un
	// snapshot propio de Turno, no un join en vivo contra Paciente (ver
	// migrarOCancelarTurnosDePerdedor en pacientes_conflicto_panel.go).
	// `EsParaOtro` evita tener que inferir "¿tiene tutor?" de "¿algún
	// campo Tutor no es nulo?" en cada query — entre otros usos, alimenta
	// la columna "Sacado por otro" de /panel/turnos.
	// TutorDNI existió hasta la tercera ronda de correcciones (2026-09-06)
	// — eliminado del todo, ver el comentario grande sobre PacienteTutor
	// más arriba en este archivo.
	EsParaOtro    bool    `gorm:"column:es_para_otro;not null;default:false"`
	TutorRelacion *string `gorm:"column:tutor_relacion;type:varchar(20)"`
	TutorNombre   *string `gorm:"column:tutor_nombre;type:varchar(150)"`
	TutorTelefono *string `gorm:"column:tutor_telefono;type:varchar(30)"`
	TutorEmail    *string `gorm:"column:tutor_email;type:varchar(255)"`

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
