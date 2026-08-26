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

export interface VerificarEmailPayload {
  token: string;
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
export interface TipoConsulta {
  id: string;
  nombre: string;
  color: string;
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
}

export interface ResumenPanel {
  turnosPendientes: number;
  turnosConfirmados: number;
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
