import "server-only";
import type {
  AutoreservarTurnosResponse,
  BloqueoHorario,
  ClinicaPublica,
  ClinicaResultado,
  Disponibilidad,
  Especialidad,
  HorarioAtencion,
  GooglePayload,
  GoogleResponse,
  GoogleStateResponse,
  LoginPayload,
  LoginResponse,
  Me,
  MensajeResponse,
  OnboardingClinicaPayload,
  OnboardingClinicaResponse,
  OnboardingPerfilPayload,
  Paciente,
  PacienteDetalle,
  PaginaPublica,
  PerfilProfesional,
  ReenviarVerificacionPayload,
  RecuperarPasswordPayload,
  RegisterPayload,
  RegisterResponse,
  ResetPasswordPayload,
  ResetPasswordResponse,
  ResumenPanel,
  TipoConsulta,
  Turno,
  VerificarEmailPayload,
  VerificarEmailResponse,
} from "@dental-mirage/shared-types";

// Cliente HTTP hacia apps/api — server-only, sin prefijo NEXT_PUBLIC_ (spec
// §9.3, BFF sin excepciones). Cualquier pantalla nueva que necesite datos
// de la API extiende este archivo y se llama desde un Server Component o
// una Server Action (src/app/actions/*.ts) — nunca un fetch nuevo desde un
// Client Component.
const API_URL = process.env.API_URL ?? "http://localhost:8080";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: "No se pudo conectar con el servidor. Probá de nuevo en un momento." };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Respuesta sin body (p. ej. un 204) — no es un error en sí mismo.
  }

  if (!res.ok) {
    const message = isErrorBody(body) ? body.error : "Ocurrió un error inesperado.";
    return { ok: false, status: res.status, error: message };
  }

  return { ok: true, data: body as T };
}

function isErrorBody(body: unknown): body is { error: string } {
  return typeof body === "object" && body !== null && "error" in body && typeof (body as { error: unknown }).error === "string";
}

export function apiListEspecialidades(): Promise<ApiResult<Especialidad[]>> {
  return request<Especialidad[]>("/especialidades");
}

export interface BuscarClinicasParams {
  q?: string;
  especialidad?: string;
}

// Buscador público de clínicas (spec §6, FR-10) — adelantado desde Sprint 4
// (T4.5), ver TR-012 en docs/tradeoffs.md.
export function apiBuscarClinicas(params: BuscarClinicasParams): Promise<ApiResult<ClinicaResultado[]>> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.especialidad) query.set("especialidad", params.especialidad);
  const qs = query.toString();
  return request<ClinicaResultado[]>(`/clinicas${qs ? `?${qs}` : ""}`);
}

// Página pública de la clínica (T3.1/T3.2, stub de contenido hasta T4.3) —
// sin autenticación, incluye teléfono para armar el link de WhatsApp
// (TR-003).
export function apiGetClinicaPublica(slug: string): Promise<ApiResult<ClinicaPublica>> {
  return request<ClinicaPublica>(`/clinicas/${slug}`);
}

export interface SolicitarTurnoPublicoPayload {
  nombreContacto: string;
  apellidoContacto: string;
  dniContacto: string;
  telefonoContacto: string;
  emailContacto: string;
  motivo?: string;
}

// Formulario público de pedido de turno (spec §4.4, T3.1/T3.2) — sin
// autenticación, crea el turno en estado `pendiente` en paralelo al envío
// por WhatsApp que arma el frontend (TR-003).
export function apiSolicitarTurnoPublico(
  slug: string,
  payload: SolicitarTurnoPublicoPayload,
): Promise<ApiResult<{ id: string }>> {
  return request<{ id: string }>(`/clinicas/${slug}/turnos`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Auth/onboarding (docs/feature-sumarte-login.md) ---
// Ninguna de estas manda la cookie de sesión — reciben el token como
// argumento explícito (server-only, la cookie la lee/escribe lib/session.ts)
// y lo reenvían como Authorization: Bearer, igual que el resto de la API.

export function apiRegister(payload: RegisterPayload): Promise<ApiResult<RegisterResponse>> {
  return request<RegisterResponse>("/auth/register", { method: "POST", body: JSON.stringify(payload) });
}

export function apiLogin(payload: LoginPayload): Promise<ApiResult<LoginResponse>> {
  return request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(payload) });
}

export function apiGoogleState(): Promise<ApiResult<GoogleStateResponse>> {
  return request<GoogleStateResponse>("/auth/google/state");
}

export function apiGoogleLogin(payload: GooglePayload): Promise<ApiResult<GoogleResponse>> {
  return request<GoogleResponse>("/auth/google", { method: "POST", body: JSON.stringify(payload) });
}

export function apiVerificarEmail(payload: VerificarEmailPayload, token?: string): Promise<ApiResult<VerificarEmailResponse>> {
  return request<VerificarEmailResponse>("/auth/verificar-email", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(payload),
  });
}

export function apiReenviarVerificacion(payload: ReenviarVerificacionPayload): Promise<ApiResult<MensajeResponse>> {
  return request<MensajeResponse>("/auth/reenviar-verificacion", { method: "POST", body: JSON.stringify(payload) });
}

export function apiRecuperarPassword(payload: RecuperarPasswordPayload): Promise<ApiResult<MensajeResponse>> {
  return request<MensajeResponse>("/auth/recuperar-password", { method: "POST", body: JSON.stringify(payload) });
}

export function apiResetPassword(payload: ResetPasswordPayload): Promise<ApiResult<ResetPasswordResponse>> {
  return request<ResetPasswordResponse>("/auth/reset-password", { method: "POST", body: JSON.stringify(payload) });
}

export function apiLogout(token: string): Promise<ApiResult<{ ok: boolean }>> {
  return request<{ ok: boolean }>("/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
}

export function apiMe(token: string): Promise<ApiResult<Me>> {
  return request<Me>("/me", { headers: { Authorization: `Bearer ${token}` } });
}

export function apiUpdateMe(token: string, payload: OnboardingPerfilPayload): Promise<ApiResult<PerfilProfesional>> {
  return request<PerfilProfesional>("/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function apiOnboardingPerfil(token: string, payload: OnboardingPerfilPayload): Promise<ApiResult<PerfilProfesional>> {
  return request<PerfilProfesional>("/onboarding/perfil", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function apiOnboardingClinica(token: string, payload: OnboardingClinicaPayload): Promise<ApiResult<OnboardingClinicaResponse>> {
  return request<OnboardingClinicaResponse>("/onboarding/clinica", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// --- Sprint 2: shell de gestión + calendario (spec §4.2, §4.3) ---

export function apiListTiposConsulta(token: string): Promise<ApiResult<TipoConsulta[]>> {
  return request<TipoConsulta[]>("/tipos-consulta", { headers: { Authorization: `Bearer ${token}` } });
}

// --- F2.3: ajustes de calendario (docs/implementation-plan.md §11.3) ---

export interface TipoConsultaPayload {
  nombre: string;
  color: string;
  duracionMinutos: number;
  tiempoPostConsultaMinutos: number;
  cantidadSesiones?: number | null;
  // preferenciaHoraDesde/preferenciaHoraHasta (nueva función, 2026-09-08)
  // — "" en ambos (o ausentes) significa "sin preferencia"; el backend
  // rechaza mandar solo uno de los dos.
  preferenciaHoraDesde?: string;
  preferenciaHoraHasta?: string;
}

export function apiCrearTipoConsulta(token: string, payload: TipoConsultaPayload): Promise<ApiResult<TipoConsulta>> {
  return request<TipoConsulta>("/tipos-consulta", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function apiEditarTipoConsulta(
  token: string,
  id: string,
  payload: TipoConsultaPayload,
): Promise<ApiResult<TipoConsulta>> {
  return request<TipoConsulta>(`/tipos-consulta/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function apiEliminarTipoConsulta(token: string, id: string): Promise<ApiResult<null>> {
  return request<null>(`/tipos-consulta/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// apiListHorarioAtencion — GET /horario-atencion (rediseño 2026-09-01):
// devuelve la LISTA completa, la general primero. Reemplaza el viejo
// apiGetHorarioAtencion (un único objeto).
export function apiListHorarioAtencion(token: string): Promise<ApiResult<HorarioAtencion[]>> {
  return request<HorarioAtencion[]>("/horario-atencion", { headers: { Authorization: `Bearer ${token}` } });
}

export interface PutHorarioAtencionGeneralPayload {
  horaDesde: string;
  horaHasta: string;
}

// apiPutHorarioAtencionGeneral — PUT /horario-atencion: upsert de la fila
// "general" (la única sin vigencia acotada, nunca "no trabaja").
export function apiPutHorarioAtencionGeneral(
  token: string,
  payload: PutHorarioAtencionGeneralPayload,
): Promise<ApiResult<HorarioAtencion>> {
  return request<HorarioAtencion>("/horario-atencion", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// CrearHorarioAtencionPayload — una EXCEPCIÓN temporal (nunca "general",
// esa va por apiPutHorarioAtencionGeneral). `noTrabaja: true` omite
// horaDesde/horaHasta — "si hay un día que no trabaja el profesional".
export interface CrearHorarioAtencionPayload {
  alcance: "semana" | "mes" | "rango";
  fechaDesde?: string;
  fechaHasta?: string;
  horaDesde?: string;
  horaHasta?: string;
  noTrabaja?: boolean;
}

export function apiCrearHorarioAtencion(
  token: string,
  payload: CrearHorarioAtencionPayload,
): Promise<ApiResult<HorarioAtencion>> {
  return request<HorarioAtencion>("/horario-atencion", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function apiEditarHorarioAtencion(
  token: string,
  id: string,
  payload: CrearHorarioAtencionPayload,
): Promise<ApiResult<HorarioAtencion>> {
  return request<HorarioAtencion>(`/horario-atencion/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function apiEliminarHorarioAtencion(token: string, id: string): Promise<ApiResult<null>> {
  return request<null>(`/horario-atencion/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function apiListBloqueos(token: string, especifico?: boolean): Promise<ApiResult<BloqueoHorario[]>> {
  const qs = especifico === undefined ? "" : `?especifico=${especifico}`;
  return request<BloqueoHorario[]>(`/bloqueos${qs}`, { headers: { Authorization: `Bearer ${token}` } });
}

export interface CrearBloqueoPayload {
  especifico: boolean;
  alcance?: "semana" | "proxima_semana" | "mes" | "proximo_mes" | "todos";
  diaSemana?: number;
  fecha?: string;
  horaDesde: string;
  horaHasta: string;
  motivo?: string;
}

export function apiCrearBloqueo(token: string, payload: CrearBloqueoPayload): Promise<ApiResult<BloqueoHorario>> {
  return request<BloqueoHorario>("/bloqueos", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function apiEditarBloqueo(token: string, id: string, payload: CrearBloqueoPayload): Promise<ApiResult<BloqueoHorario>> {
  return request<BloqueoHorario>(`/bloqueos/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function apiEliminarBloqueo(token: string, id: string): Promise<ApiResult<null>> {
  return request<null>(`/bloqueos/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// apiListDisponibilidad — corrección de QA sobre F2.3 (adelanta parte de
// F2.4.1/TR-079): horarios realmente elegibles para un tipo de consulta
// en una fecha, ya descontando horario de atención, bloqueos y turnos ya
// agendados (con su propio tiempo post-consulta). `excluirTurnoId` es
// para reprogramar un turno existente sin que cuente contra sí mismo.
export function apiListDisponibilidad(
  token: string,
  tipoConsultaId: string,
  fecha: string,
  excluirTurnoId?: string,
): Promise<ApiResult<Disponibilidad>> {
  const query = new URLSearchParams({ tipoConsultaId, fecha });
  if (excluirTurnoId) query.set("excluirTurnoId", excluirTurnoId);
  return request<Disponibilidad>(`/disponibilidad?${query.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
}

export interface ListarTurnosParams {
  estado?: "pendiente" | "agendado" | "cancelada";
  desde?: string;
  hasta?: string;
  q?: string;
  // resuelto (2026-08-23): separa, dentro de estado=agendado, los turnos
  // cuya hora de fin ya pasó (pestaña "Resueltos" de la vista Turnos) —
  // sin esto, estado=agendado sigue trayendo pasados y futuros juntos
  // (lo que necesita el calendario).
  resuelto?: boolean;
}

export function apiListTurnos(token: string, params: ListarTurnosParams = {}): Promise<ApiResult<Turno[]>> {
  const query = new URLSearchParams();
  if (params.estado) query.set("estado", params.estado);
  if (params.desde) query.set("desde", params.desde);
  if (params.hasta) query.set("hasta", params.hasta);
  if (params.q) query.set("q", params.q);
  if (params.resuelto !== undefined) query.set("resuelto", String(params.resuelto));
  const qs = query.toString();
  return request<Turno[]>(`/turnos${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
}

export interface CrearTurnoManualPayload {
  nombreContacto: string;
  apellidoContacto: string;
  dniContacto: string;
  telefonoContacto: string;
  emailContacto?: string;
  motivo?: string;
  tipoConsultaId: string;
  horaInicio: string;
  horaFin: string;
  // Camino "paciente conocido" (2026-08-23): vincula el turno nuevo a un
  // paciente que ya existe en vez de crear una ficha duplicada.
  pacienteId?: string;
}

// Camino "paciente nuevo" del modal "+ Agregar turno" (spec §4.3).
export function apiCrearTurnoManual(token: string, payload: CrearTurnoManualPayload): Promise<ApiResult<Turno>> {
  return request<Turno>("/turnos", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export interface AgendarTurnoPayload {
  tipoConsultaId: string;
  horaInicio: string;
  horaFin: string;
  // 2026-08-23: se puede completar/corregir el motivo de consulta en este
  // mismo paso de confirmar un turno pendiente.
  motivo?: string;
}

// Camino "desde turnos pendientes" del modal "+ Agregar turno" (spec §4.3).
export function apiAgendarTurno(token: string, turnoId: string, payload: AgendarTurnoPayload): Promise<ApiResult<Turno>> {
  return request<Turno>(`/turnos/${turnoId}/agendar`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export interface ReprogramarTurnoPayload {
  horaInicio: string;
  horaFin: string;
  motivo?: string;
}

// reprogramarTurno — "Editar" de un turno ya confirmado (2026-08-23): solo
// cambia el horario y el motivo de consulta, nunca los datos de contacto
// (eso es editarTurno, y solo funciona en turnos pendientes).
export function apiReprogramarTurno(token: string, turnoId: string, payload: ReprogramarTurnoPayload): Promise<ApiResult<Turno>> {
  return request<Turno>(`/turnos/${turnoId}/hora`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// apiAutoreservarTurnos — botón "Autoreservar turnos" del modal de
// conflicto (nueva función, pedido textual del cliente, 2026-09-08):
// mueve cada turno de `turnoIds` al próximo horario libre (por orden de
// prioridad, calculado del lado del backend — ver
// autoreservarTurnosHandler en apps/api). Devuelve el horario ANTERIOR y
// el NUEVO de cada uno para la pantalla de confirmación.
export function apiAutoreservarTurnos(token: string, turnoIds: string[]): Promise<ApiResult<AutoreservarTurnosResponse>> {
  return request<AutoreservarTurnosResponse>("/turnos/autoreservar", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ turnoIds }),
  });
}

// T2.2 (F2.3 extra ítem 1 lo reescribe de punta a punta, docs/implementation-plan.md
// §11.5): datos de las 5 tarjetas del dashboard "Turnero".
export function apiResumenPanel(token: string): Promise<ApiResult<ResumenPanel>> {
  return request<ResumenPanel>("/panel/resumen", { headers: { Authorization: `Bearer ${token}` } });
}

// --- Sprint 3: Turnos entrantes + Pacientes (spec §4.4, §4.5) ---

// Cancelar (T3.3) es idempotente del lado del backend — llamarlo sobre un
// turno ya cancelado no es un error.
export function apiCancelarTurno(token: string, turnoId: string): Promise<ApiResult<Turno>> {
  return request<Turno>(`/turnos/${turnoId}/cancelar`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// marcarAsistencia (pedido explícito del cliente, 2026-09-04): solo tiene
// efecto en un turno ya resuelto (ver marcarAsistenciaHandler en
// turnos.go) — irreversible: una vez marcada, el backend rechaza
// cualquier otro intento sobre este mismo turno (ni cambiar de valor ni
// repetirlo), por eso ya no existe un valor "" para deshacerla.
export function apiMarcarAsistencia(
  token: string,
  turnoId: string,
  asistencia: "asistio" | "ausente",
): Promise<ApiResult<Turno>> {
  return request<Turno>(`/turnos/${turnoId}/asistencia`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ asistencia }),
  });
}

export interface EditarTurnoPayload {
  nombreContacto: string;
  apellidoContacto: string;
  dniContacto: string;
  telefonoContacto: string;
  emailContacto?: string;
  motivo?: string;
}

// Editar (T3.3) corrige solo los datos de contacto — nunca horario ni tipo
// de consulta, eso pasa por /agendar (T2.4).
export function apiEditarTurno(token: string, turnoId: string, payload: EditarTurnoPayload): Promise<ApiResult<Turno>> {
  return request<Turno>(`/turnos/${turnoId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// T3.5: tabla de pacientes, buscador por nombre/apellido/DNI.
export function apiListPacientes(token: string, q?: string): Promise<ApiResult<Paciente[]>> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return request<Paciente[]>(`/pacientes${qs}`, { headers: { Authorization: `Bearer ${token}` } });
}

// T3.6: detalle de paciente + historial completo de turnos.
export function apiGetPaciente(token: string, id: string): Promise<ApiResult<PacienteDetalle>> {
  return request<PacienteDetalle>(`/pacientes/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}

export interface EditarPacientePayload {
  dni: string;
  telefono: string;
  email?: string;
}

// Corrige DNI/teléfono/email de la ficha del paciente (2026-08-23, "por si
// hay alguna actualización en estos datos") — nombre/apellido no son
// editables acá todavía.
export function apiEditarPaciente(token: string, id: string, payload: EditarPacientePayload): Promise<ApiResult<Paciente>> {
  return request<Paciente>(`/pacientes/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// --- Sprint 4: edición y deploy de página pública (spec §5, T4.1/T4.2) ---

export function apiGetPaginaPublica(token: string): Promise<ApiResult<PaginaPublica>> {
  return request<PaginaPublica>("/panel/pagina", { headers: { Authorization: `Bearer ${token}` } });
}

export interface OcultarPaginaPublicaPayload {
  oculta: boolean;
}

// Ocultar/mostrar (T4.2, spec §5.2) — a diferencia de deployar, es
// reversible en cualquier dirección: pone/saca el modo "en mantenimiento".
export function apiOcultarPaginaPublica(
  token: string,
  payload: OcultarPaginaPublicaPayload,
): Promise<ApiResult<PaginaPublica>> {
  return request<PaginaPublica>("/panel/pagina/ocultar", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// Deployar (T4.2, spec §5.2) es de una sola dirección — publica la página
// por primera vez, sin body. El backend es idempotente: llamarlo de nuevo
// no pisa la fecha del primer deploy (ver internal/http/pagina_publica.go).
export function apiDeployarPaginaPublica(token: string): Promise<ApiResult<PaginaPublica>> {
  return request<PaginaPublica>("/panel/pagina/deployar", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
}
