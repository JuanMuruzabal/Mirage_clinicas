// Tipos espejo de los structs Go de apps/api (internal/http/*.go). Se
// amplía en cada sprint que agregue un endpoint nuevo — mantenimiento a
// mano, no generado (mismo trade-off que Marcuzzi_Madryn, ver R8 en
// docs/implementation-plan.md).

export interface Especialidad {
  id: string;
  nombre: string;
}

// --- Auth/onboarding (docs/feature-sumarte-login.md) ---
// Reemplaza al viejo Profesional/AuthResponse (una sola fila que hacía de
// usuario+clínica) — ahora la identidad (User), el perfil profesional
// (ProfessionalProfile) y la clínica (Clinic) son entidades separadas.

export type ClinicRole = "owner" | "admin" | "profesional" | "recepcion";
export type ClinicTipo = "individual" | "organizacion";
export type MatriculaTipo = "nacional" | "provincial" | "";
export type OnboardingStep = "cuenta" | "perfil" | "clinica" | "completo";

// Espejo de perfilResponse (internal/http/onboarding.go).
export interface PerfilProfesional {
  nombre: string;
  apellido: string;
  telefonoPrefijo: string;
  telefono: string;
  documento?: string | null;
  matriculaTipo: MatriculaTipo;
  matriculaNumero: string;
  especialidades: Especialidad[];
  aniosExperiencia?: number | null;
  bio?: string | null;
  idiomas?: string[] | null;
}

// Espejo de clinicaMeResponse (internal/http/me.go).
export interface ClinicaSesion {
  id: string;
  nombre: string;
  slug: string;
  tipo: ClinicTipo;
  rol: ClinicRole;
}

// Espejo de meResponse (internal/http/me.go, GET /me). `perfil`/`clinica`
// vienen ausentes mientras el onboarding no llegó a esos pasos — el
// frontend usa justamente eso (+ `onboardingStep`) para saber a qué paso
// del wizard redirigir.
export interface Me {
  id: string;
  email: string;
  emailVerificado: boolean;
  onboardingStep: OnboardingStep;
  onboardingCompletado: boolean;
  perfil?: PerfilProfesional;
  clinica?: ClinicaSesion;
}

// --- Payloads de los endpoints de /auth (internal/http/auth.go) ---

export interface RegisterPayload {
  email: string;
  password: string;
  aceptaTerminos: boolean;
  captchaToken?: string;
}

// `token` viene ausente si el email ya existía (spec §7, anti-enumeración
// — nunca crea una sesión de una cuenta ajena).
export interface RegisterResponse {
  token?: string;
  email: string;
  mensaje: string;
  // TR-051 en docs/tradeoffs.md: cuentas nativas nuevas pueden llegar ya
  // verificadas (AutoVerifyEmail en el backend, mientras Resend no esté
  // configurado) — el wizard usa esto para saltar la pantalla "revisá tu
  // correo" e ir directo al Paso 2, igual que con Google.
  emailVerificado: boolean;
  onboardingStep?: OnboardingStep;
  // TR-062 en docs/tradeoffs.md: true únicamente cuando el mail ya tiene
  // una cuenta VERIFICADA — el único caso donde se decide revelarlo a
  // propósito (pedido explícito del cliente, revierte parcialmente el
  // anti-enumeración de arriba solo para este caso puntual). El wizard
  // lo usa para mostrar "iniciá sesión"/"recuperar contraseña" en vez de
  // avanzar al paso de código.
  cuentaExistente?: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
}

// `emailVerificado: false` es la única excepción admitida a la
// anti-enumeración (spec §7) — se distingue de "credenciales incorrectas"
// para ofrecer un reenvío en vez de un error genérico.
export interface LoginResponse {
  token?: string;
  emailVerificado: boolean;
  mensaje?: string;
}

export interface GoogleStateResponse {
  state: string;
}

export interface GooglePayload {
  code: string;
  state: string;
}

export interface GoogleResponse {
  token: string;
  onboardingStep: OnboardingStep;
}

// TR-055 en docs/tradeoffs.md: código de 6 dígitos que se escribe a mano,
// no un token de link — hace falta el mail para saber contra qué cuenta
// validarlo (el código en sí no es único globalmente).
export interface VerificarEmailPayload {
  email: string;
  codigo: string;
}

export interface VerificarEmailResponse {
  token: string;
  onboardingStep: OnboardingStep;
}

export interface ReenviarVerificacionPayload {
  email: string;
}

export interface MensajeResponse {
  mensaje: string;
}

export interface RecuperarPasswordPayload {
  email: string;
  captchaToken?: string;
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  token: string;
}

// --- Payloads de /onboarding (internal/http/onboarding.go) ---

export interface OnboardingPerfilPayload {
  nombre: string;
  apellido: string;
  telefonoPrefijo?: string;
  telefono: string;
  documento?: string;
  matriculaTipo: "nacional" | "provincial";
  matriculaNumero: string;
  especialidadIds: string[];
  aniosExperiencia?: number;
  bio?: string;
  idiomas?: string[];
}

export interface OnboardingClinicaPayload {
  tipo: ClinicTipo;
  nombre: string;
  direccion?: string;
  ciudad?: string;
  provincia?: string;
  telefono?: string;
}

export interface OnboardingClinicaResponse {
  clinicId: string;
  slug: string;
  onboardingStep: OnboardingStep;
}

// Resultado del buscador público de clínicas (spec §6, FR-10) — nunca
// datos sensibles del profesional (email, teléfono).
export interface ClinicaResultado {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  especialidades: string[];
}

// Catálogo por profesional (TR-001), no global — spec §4.3.
// duracionMinutos/tiempoPostConsultaMinutos/cantidadSesiones (F2.3,
// TR-084 en docs/tradeoffs.md): configurables por tipo de consulta, no a
// nivel de clínica — cantidadSesiones es puramente informativo esta fase.
// Los tres opcionales acá (aunque la API real siempre los manda) para no
// forzar a actualizar cada fixture de test existente que arma un
// TipoConsulta mínimo sin ellos — el código que de verdad los necesita
// (la sección de tipos de consulta de ConfiguracionCalendarioModal) los
// trata como presentes en tiempo de ejecución.
export interface TipoConsulta {
  id: string;
  nombre: string;
  color: string;
  duracionMinutos?: number;
  tiempoPostConsultaMinutos?: number;
  cantidadSesiones?: number;
}

// Espejo de horarioAtencionResponse (internal/http/horario_atencion.go,
// rediseño 2026-09-01, corrección de QA: "puede que un profesional tenga
// horarios de atención variable"). GET /horario-atencion devuelve una
// LISTA: la fila "general" (siempre presente, aunque sea la sintetizada
// por default) primero, seguida de las excepciones temporales vigentes
// (alcance "semana"/"mes"/"rango") — mismo criterio de prioridad que
// BloqueoHorario, "la más específica gana" mientras esté vigente.
// horaDesde/horaHasta ausentes a la vez = "no trabaja" ese período.
export interface HorarioAtencion {
  id: string;
  alcance: "general" | "semana" | "mes" | "rango";
  fechaDesde?: string;
  fechaHasta?: string;
  horaDesde?: string;
  horaHasta?: string;
}

// Espejo de bloqueoHorarioResponse (internal/http/bloqueos_horario.go,
// F2.3.3) — cubre reglas generales Y específicas por el mismo tipo
// (TR-084): una específica trae `fecha`; una general trae `diaSemana` +
// `alcance` (y fechaDesde/fechaHasta ya resueltos por el backend, salvo
// alcance "todos"). Fechas como "YYYY-MM-DD", horas como "HH:MM".
export interface BloqueoHorario {
  id: string;
  especifico: boolean;
  // "proxima_semana"/"proximo_mes" (corrección de QA, 2026-08-30): mismo
  // criterio "de una sola vez" que "semana"/"mes" (TR-084), ancladas a la
  // semana/mes SIGUIENTE en vez del actual.
  alcance?: "semana" | "proxima_semana" | "mes" | "proximo_mes" | "todos";
  diaSemana?: number;
  fechaDesde?: string;
  fechaHasta?: string;
  fecha?: string;
  horaDesde: string;
  horaHasta: string;
  tipoRegla: string;
  // Motivo (corrección de QA, F2.3): descriptivo, opcional — "una general
  // puede ser limpieza semanal, una específica puede ser reposición de
  // inventario".
  motivo?: string;
}

// Espejo de disponibilidadResponse (internal/http/disponibilidad.go,
// corrección de QA sobre F2.3) — horarios "HH:MM" ya filtrados por
// horario de atención, bloqueos vigentes y turnos ya agendados (con su
// propio tiempo post-consulta contando como ocupado).
export interface Disponibilidad {
  slots: string[];
}

// Espejo de turnoResponse (internal/http/turnos.go) — sin
// tipoConsultaNombre/Color a propósito: el front cruza por tipoConsultaId
// contra el catálogo de TipoConsulta que ya tiene cargado.
export interface Turno {
  id: string;
  estado: "pendiente" | "agendado" | "cancelada";
  origen: "pagina_publica" | "manual";
  tipoConsultaId?: string;
  horaInicio?: string;
  horaFin?: string;
  pacienteId?: string;
  nombreContacto: string;
  apellidoContacto: string;
  dniContacto: string;
  telefonoContacto: string;
  emailContacto: string;
  motivo: string;
  createdAt: string;
  // Asistencia (pedido explícito del cliente, 2026-09-04): ausente hasta
  // que se marca desde un turno ya resuelto — "asistio" | "ausente" | nil.
  asistencia?: "asistio" | "ausente" | null;
}

export interface ResumenTurnoItem {
  id: string;
  fecha: string; // YYYY-MM-DD, Córdoba
  hora: string; // HH:MM, Córdoba
  horaFin: string; // HH:MM, Córdoba
  nombre: string;
}

export interface ResumenHorarioReservadoItem {
  id: string;
  // Fecha real (específico) o próxima ocurrencia del día de semana
  // (general, que en la base no tiene una única fecha) — siempre
  // concreta, para poder linkear a una semana real del calendario.
  fecha: string;
  horaDesde: string;
  horaHasta: string;
  motivo: string | null;
}

// ResumenPanel (F2.3 extra, ítem 1 — rediseño del "Turnero",
// docs/implementation-plan.md §11.5): reemplaza los 2 contadores viejos
// (pendientes/confirmados) por los datos de las 5 tarjetas nuevas.
export interface ResumenPanel {
  turnosHoy: ResumenTurnoItem[];
  turnosProximos: ResumenTurnoItem[];
  horariosReservados: ResumenHorarioReservadoItem[];
  totalConfirmados: number;
  turnosResueltos: ResumenTurnoItem[];
  // Tarjeta "Estadística" (corrección de QA, 2026-09-06) — total
  // histórico, sin acotar por fecha.
  turnosAsistidos: number;
  turnosAusentes: number;
}

// --- Sprint 3: turnos entrantes + pacientes + formulario público ---

// Espejo de clinicaPublicaResponse (internal/http/clinicas.go) — a
// diferencia de ClinicaResultado (buscador), SÍ incluye teléfono: es lo que
// necesita el formulario público de pedir turno para armar el link de
// WhatsApp (TR-003). `oculta` (T4.4, spec §5.2) decide si un visitante ve
// el contenido o la pantalla de mantenimiento.
export interface ClinicaPublica {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  telefono?: string | null;
  especialidades: string[];
  oculta: boolean;
}

// --- Sprint 4: edición y deploy de página pública (spec §5) ---

// Espejo de paginaPublicaResponse (internal/http/pagina_publica.go).
// `deployadaEn` nulo = todavía no se publicó por primera vez (spec §5.2)
// — no aparece en el buscador (GET /clinicas) hasta que se deploya, pero
// la URL propia (`/{slug}`) ya se puede previsualizar antes.
export interface PaginaPublica {
  oculta: boolean;
  deployadaEn?: string | null;
}

// Espejo de pacienteResponse (internal/http/pacientes.go).
export interface Paciente {
  id: string;
  nombre: string;
  apellido: string;
  dni: string;
  telefono: string;
  email?: string | null;
  createdAt: string;
}

// Espejo de pacienteDetalleResponse — datos personales + historial
// completo de turnos (T3.6); el front separa "activos" de "historial".
export interface PacienteDetalle extends Paciente {
  turnos: Turno[];
}
