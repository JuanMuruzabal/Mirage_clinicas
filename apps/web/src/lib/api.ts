import "server-only";
import { headers } from "next/headers";
import type {
  AutoreservarTurnosResponse,
  BloqueoHorario,
  BloqueosSeguridad,
  ClinicaPublica,
  ClinicaResultado,
  ConflictoPaciente,
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
  PanelNotificacionesResponse,
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
  TurnosPendientesAsistenciaResponse,
  VerificarEmailPayload,
  VerificarEmailResponse,
} from "@dental-mirage/shared-types";

// Cliente HTTP hacia apps/api — server-only, sin prefijo NEXT_PUBLIC_ (spec
// §9.3, BFF sin excepciones). Cualquier pantalla nueva que necesite datos
// de la API extiende este archivo y se llama desde un Server Component o
// una Server Action (src/app/actions/*.ts) — nunca un fetch nuevo desde un
// Client Component.
const API_URL = process.env.API_URL ?? "http://localhost:8080";

// requestTimeoutMs — corrección de seguridad/optimización (auditoría
// 2026-09-08, docs/Seguridad y optimizacion/radiografia-tecnica_1.md):
// este fetch no tenía ningún timeout propio — si el backend se cuelga o
// responde muy lento, cada Server Action/Server Component que dependa de
// él quedaba esperando sin un corte propio. Un poco por encima del
// WriteTimeout del backend (30s, cmd/api/main.go) — así una request que
// el backend todavía está procesando dentro de SU propio límite no se
// corta antes de tiempo del lado del frontend.
const requestTimeoutMs = 35_000;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

// Pagina<T> — una tanda de un listado paginado, más el total que hay
// detrás de los filtros actuales (Fase B de la auditoría, ver
// internal/http/paginacion.go en el backend). El total es lo que le
// permite a la UI saber si mostrar "Cargar más" o no.
export interface Pagina<T> {
  items: T[];
  total: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await requestRaw<T>(path, init);
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

// requestPaginado — igual que request, pero además lee el total del
// header `X-Total-Count`. El backend lo manda ahí, y no en el body, para
// que la respuesta siga siendo el mismo array JSON de siempre y ningún
// consumidor existente se rompa (ver paginacion.go). Si el header no
// viene —porque no se pidió paginar, o porque un proxy lo filtró— se cae
// a la cantidad de items recibidos: el peor caso es que la UI no ofrezca
// "Cargar más", nunca que rompa.
async function requestPaginado<T>(path: string, init?: RequestInit): Promise<ApiResult<Pagina<T>>> {
  const res = await requestRaw<T[]>(path, init);
  if (!res.ok) return res;
  const crudo = res.headers.get("X-Total-Count");
  const total = crudo !== null && crudo !== "" && !Number.isNaN(Number(crudo)) ? Number(crudo) : res.data.length;
  return { ok: true, data: { items: res.data, total } };
}

// --- Fase 3.1.1: la IP real del visitante ---------------------------
//
// El navegador nunca llama a la API Go directo (CLAUDE.md, "BFF con
// Server Actions"), así que del otro lado llega SIEMPRE la IP de este
// proceso web — la misma para todos los visitantes de todas las clínicas.
// El rate-limiting por IP y los tres detectores de abuso del wizard
// público quedaban contando a todo el mundo como una sola persona: cuatro
// pacientes distintos sacando turno la misma tarde alcanzaban para que el
// detector de rotación por IP les borrara los turnos (pasó en QA el
// 2026-09-12).
//
// Acá, en el único lugar por donde sale todo el tráfico hacia la API, se
// adjunta la IP real. Va acompañada del secreto compartido porque la API
// es un servicio PÚBLICO: sin esa prueba, cualquiera podría pegarle
// directo diciendo ser la IP que quisiera. Ver la contraparte en
// apps/api/internal/http/ip_del_visitante.go.
const BFF_SHARED_SECRET = process.env.BFF_SHARED_SECRET ?? "";

// ipDelVisitante — mismo orden de preferencia que `clientIP()` en Go, y por
// el mismo motivo (Fase 3.1.2).
//
// La primera versión tomaba el ÚLTIMO valor de `x-forwarded-for`, siguiendo
// TR-121: con exactamente un proxy de confianza adelante, ese es el único
// que el cliente no puede falsificar. Medido contra el deploy real, la
// premisa era falsa: Render pone Cloudflare delante de todos sus servicios
// y además tiene un router interno, así que el final de la cadena es
// infraestructura. Un GET de prueba quedó logueado como `ip=10.29.215.4`,
// una dirección privada.
//
//   1. `cf-connecting-ip`, que Cloudflare sobrescribe en cada request.
//   2. Si no está, la última IP PÚBLICA de la cadena — sigue valiendo que
//      el cliente solo controla el principio, pero saltea los saltos
//      internos del final.
//
// Devuelve "" sin romper nada si no hay contexto de request (durante el
// build) o si no hay cabeceras (desarrollo local: el navegador le pega
// derecho a Next, sin proxy en el medio). Sin IP no se manda nada.
function esIPPublica(valor: string): boolean {
  const ip = valor.trim();
  if (!ip) return false;
  // Privadas (RFC1918), loopback, link-local y sus equivalentes IPv6.
  return !/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|f[cd])/i.test(ip);
}

async function ipDelVisitante(): Promise<string> {
  if (!BFF_SHARED_SECRET) return "";
  try {
    const h = await headers();
    const cf = (h.get("cf-connecting-ip") ?? "").trim();
    if (cf && esIPPublica(cf)) return cf;

    const crudo = h.get("x-forwarded-for");
    if (!crudo) return "";
    const partes = crudo.split(",").map((p) => p.trim()).filter(Boolean);
    for (let i = partes.length - 1; i >= 0; i--) {
      if (esIPPublica(partes[i])) return partes[i];
    }
    return "";
  } catch {
    return "";
  }
}

async function cabecerasDeIP(): Promise<Record<string, string>> {
  const ip = await ipDelVisitante();
  if (!ip) return {};
  return { "X-Prisma-Client-IP": ip, "X-Prisma-Bff-Auth": BFF_SHARED_SECRET };
}

type RawResult<T> = { ok: true; data: T; headers: Headers } | { ok: false; status: number; error: string };

// requestRaw — el fetch real. Existe separado de `request` solo para que
// requestPaginado pueda mirar los headers de la respuesta sin duplicar
// todo el manejo de errores/timeout.
async function requestRaw<T>(path: string, init?: RequestInit): Promise<RawResult<T>> {
  let res: Response;
  // Las cabeceras de IP van PRIMERO en el objeto para que un `init.headers`
  // nunca pueda pisarlas por accidente desde un call site.
  const deIP = await cabecerasDeIP();
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...deIP, ...(init?.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, status: 0, error: "El servidor tardó demasiado en responder. Probá de nuevo en un momento." };
    }
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

  return { ok: true, data: body as T, headers: res.headers };
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
// (T4.5), ver TR-012 en docs/Arquitectura y base/tradeoffs.md.
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

// TipoConsultaPublico — Extra 2.3.5 (E5.2/E5.3): versión reducida de
// TipoConsulta para el wizard público, sin tiempo post-consulta/cantidad de
// sesiones/preferencia de atención — detalles internos del cálculo de
// disponibilidad, no algo que el paciente elija o necesite ver.
export interface TipoConsultaPublico {
  id: string;
  nombre: string;
  color: string;
  duracionMinutos: number;
}

// Primer paso de datos del wizard público después de los datos de
// contacto: qué tipos de consulta ofrece la clínica (E5.3).
export function apiListTiposConsultaPublico(slug: string): Promise<ApiResult<TipoConsultaPublico[]>> {
  return request<TipoConsultaPublico[]>(`/clinicas/${slug}/tipos-consulta`);
}

// Mismo cálculo que apiListDisponibilidad (autenticado, lo usa el
// profesional) — acá resuelto por slug público en vez de por sesión, y sin
// excluirTurnoId (el wizard público siempre pide un turno nuevo).
export function apiListDisponibilidadPublica(slug: string, tipoConsultaId: string, fecha: string): Promise<ApiResult<Disponibilidad>> {
  const query = new URLSearchParams({ tipoConsultaId, fecha });
  return request<Disponibilidad>(`/clinicas/${slug}/disponibilidad?${query.toString()}`);
}

// DisponibilidadMes — docs/Fases post MVP/Fase 2/turnero_pagina/rediseno-flujo-turnos.md §3.8 (panel de
// calendario mensual del wizard público): qué días de un mes tienen algún
// horario disponible, para pintar el punto "con turnos" ANTES de que el
// paciente toque ningún día.
export interface DisponibilidadMes {
  dias: string[];
}

export function apiListDisponibilidadMesPublica(slug: string, tipoConsultaId: string, mes: string): Promise<ApiResult<DisponibilidadMes>> {
  const query = new URLSearchParams({ tipoConsultaId, mes });
  return request<DisponibilidadMes>(`/clinicas/${slug}/disponibilidad-mes?${query.toString()}`);
}

// EnlaceTurno — Fase 2, ítem 5 ("compartir calendario"): link de 1h que
// el profesional genera desde "+ Agregar turno" → "Compartir link de
// turnero", sin CAPTCHA ni "Confirmanos que sos vos" del lado de quien lo
// recibe (ver el comentario grande de solicitarTurnoPublicoHandler en el
// backend para qué controles se mantienen igual).
export interface EnlaceTurno {
  url: string;
  expiraEn: string;
}

// apiCrearEnlaceTurno (autenticado, panel) — la clínica se resuelve por
// sesión, no hace falta pasar el slug.
export function apiCrearEnlaceTurno(token: string): Promise<ApiResult<EnlaceTurno>> {
  return request<EnlaceTurno>("/enlaces-turno", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
}

// apiValidarEnlaceTurnoPublico (público, sin sesión) — chequeo de solo
// lectura que el wizard corre apenas se abre por un link compartido, para
// avisar "este link ya no es válido" antes de completar todo el
// formulario. La validación real (la que de verdad cuenta) vuelve a
// correr del lado del backend al confirmar el turno.
export function apiValidarEnlaceTurnoPublico(slug: string, token: string): Promise<ApiResult<{ valido: boolean }>> {
  const query = new URLSearchParams({ token });
  return request<{ valido: boolean }>(`/clinicas/${slug}/enlaces-turno/validar?${query.toString()}`);
}

export interface SolicitarTurnoPublicoPayload {
  // nombreContacto/apellidoContacto/dniContacto/telefonoContacto —
  // obligatorios en el camino "primera vez"; se omiten en el camino "ya he
  // venido antes" (Fase 2.4.1, pacienteVerificadoId), donde se completan
  // solos del lado del backend a partir de la ficha ya identificada.
  nombreContacto?: string;
  apellidoContacto?: string;
  dniContacto?: string;
  // telefonoContacto/emailContacto — obligatorios en "para mí, primera
  // vez" (el propio formulario los valida antes de mandar el payload);
  // opcionales en "ya he venido antes" (se completan solos del lado del
  // backend) y en "para otro" (Fase 2.4.2: el teléfono/mail PROPIO del
  // paciente quedan opcionales ahí — la identidad verificada es
  // tutorEmail, no emailContacto).
  telefonoContacto?: string;
  emailContacto?: string;
  motivo?: string;
  // tipoConsultaId/fecha/hora — Extra 2.3.5 (E5.2/E5.3): el wizard público
  // ahora elige tipo de consulta, fecha y horario disponible antes de
  // confirmar — el turno nace `agendado`, con horario real, nunca más
  // `pendiente` (TR-006 queda solo para turnos ya viejos hasta que Extra
  // 2.3.3 saque el estado del todo).
  tipoConsultaId: string;
  fecha: string;
  hora: string;
  // verificacionToken (E5.6, "Confirmanos que sos vos") — token opaco que
  // devuelve apiConfirmarVerificacionTurnoPublico tras validar el código
  // de 6 dígitos mandado a emailContacto. Opcional acá (a diferencia del
  // backend, que exige EXACTAMENTE uno de los dos) porque el camino de
  // enlaceToken (Fase 2, ítem 5) lo reemplaza del todo — sin ninguno de
  // los dos, el backend rechaza el pedido de turno igual.
  verificacionToken?: string;
  // pacienteVerificadoId (Fase 2.4.1, camino "ya he venido antes") — id de
  // la ficha que devolvió apiGetPacienteVerificadoPublico tras confirmar la
  // "tarjeta clickeable". Si viene, el backend vincula el turno directo a
  // esa ficha sin pasar por la detección de conflicto.
  pacienteVerificadoId?: string;
  // paraOtro/tutor* (Fase 2.4.2, camino "sacar turno para otro") —
  // nombreContacto/apellidoContacto/dniContacto de arriba siguen siendo
  // del PACIENTE (sin cambio de significado); telefonoContacto/
  // emailContacto pasan a ser el teléfono/mail PROPIO del paciente,
  // opcionales en este camino. El mail que de verdad se verifica es
  // tutorEmail.
  paraOtro?: boolean;
  tutorRelacion?: string;
  tutorNombre?: string;
  tutorTelefono?: string;
  tutorEmail?: string;
  // enlaceToken (Fase 2, ítem 5 — "compartir calendario") — alternativa a
  // verificacionToken cuando el wizard se abrió desde un link generado
  // por el profesional (`?enlace=` en la página pública): mutuamente
  // excluyentes, nunca se mandan los dos juntos. Ver
  // apiCrearEnlaceTurno/apiValidarEnlaceTurnoPublico más abajo.
  enlaceToken?: string;
}

export interface EnviarVerificacionTurnoPublicoResponse {
  mensaje: string;
  // codigoDev (Fase 2.4.1) — SOLO viene en local (sin RESEND_API_KEY
  // configurada, ver AuthDeps.ExponerCodigoVerificacion en el backend);
  // nunca en producción. Comodidad de desarrollo, pedida por el cliente,
  // para no tener que mirar los logs del backend mientras se prueba el
  // wizard público.
  codigoDev?: string;
}

// EnviarVerificacionTurnoPublicoPayload/apiEnviarVerificacionTurnoPublico
// (E5.6) — primer paso de "Confirmanos que sos vos": manda un código de 6
// dígitos al mail que puso el paciente. `captchaToken` (corrección de
// seguridad, Fase 2.4.1) es el resultado del widget de Turnstile — mismo
// criterio que apiRegister: string vacía si el widget no se renderizó
// (sin NEXT_PUBLIC_TURNSTILE_SITE_KEY), consistente con el backend
// tratando un Turnstile no configurado como CAPTCHA deshabilitado.
export function apiEnviarVerificacionTurnoPublico(
  slug: string,
  email: string,
  captchaToken: string,
): Promise<ApiResult<EnviarVerificacionTurnoPublicoResponse>> {
  return request<EnviarVerificacionTurnoPublicoResponse>(`/clinicas/${slug}/verificacion-email`, {
    method: "POST",
    body: JSON.stringify({ email, captchaToken }),
  });
}

// apiConfirmarVerificacionTurnoPublico (E5.6) — valida el código y, si es
// correcto, devuelve el token de prueba que el resto del wizard tiene que
// mandar junto con el pedido de turno final.
export function apiConfirmarVerificacionTurnoPublico(slug: string, email: string, codigo: string): Promise<ApiResult<{ token: string }>> {
  return request<{ token: string }>(`/clinicas/${slug}/verificacion-email/confirmar`, {
    method: "POST",
    body: JSON.stringify({ email, codigo }),
  });
}

// PacienteVerificadoPublico — Fase 2.4.1, camino "ya he venido antes":
// datos YA CENSURADOS por el backend (nunca se manda el dato crudo para
// censurarlo acá) para la "tarjeta clickeable" que el paciente confirma
// antes de saltar directo al paso de horario.
export interface PacienteVerificadoPublico {
  id: string;
  nombre: string;
  dni: string;
}

// apiGetPacienteVerificadoPublico (Fase 2.4.1) — exige un token de
// "Confirmanos que sos vos" vigente y sin usar para el mail dado (se
// valida, no se consume: el paciente lo va a necesitar de nuevo al mandar
// el pedido final). 404 si no hay una ficha VERIFICADA que matchee DNI +
// mail — el wizard interpreta eso como "no encontramos tu ficha, empezá
// como paciente nuevo".
//
// enlaceToken (Fase 2, ítem 5) — alternativa a verificacionToken cuando el
// wizard se abrió desde un link compartido: mismo criterio "validar sin
// consumir", mutuamente excluyente con verificacionToken (nunca los dos
// juntos). El wizard entero se replica igual con enlace, código por
// código — este es el único punto donde cambia qué credencial se manda.
export function apiGetPacienteVerificadoPublico(
  slug: string,
  dni: string,
  email: string,
  credencial: { verificacionToken: string } | { enlaceToken: string },
): Promise<ApiResult<PacienteVerificadoPublico>> {
  const query = new URLSearchParams({ dni, email, ...credencial });
  return request<PacienteVerificadoPublico>(`/clinicas/${slug}/pacientes/verificado?${query.toString()}`);
}

// apiGetPacientesVerificadosDeTutorPublico (Fase 2.4.2, camino "sacar
// turno para otro" + "ya he venido antes") — segundo modo del mismo
// endpoint de arriba: busca por MAIL DEL TUTOR en vez de por DNI del
// paciente y puede devolver más de una tarjeta (un tutor puede tener más
// de un hijo verificado a su cargo). Mismo criterio de "exige token
// vigente y sin usar" que el modo por DNI, y misma alternativa
// verificacionToken/enlaceToken que arriba.
export function apiGetPacientesVerificadosDeTutorPublico(
  slug: string,
  tutorEmail: string,
  credencial: { verificacionToken: string } | { enlaceToken: string },
): Promise<ApiResult<PacienteVerificadoPublico[]>> {
  const query = new URLSearchParams({ tutorEmail, ...credencial });
  return request<PacienteVerificadoPublico[]>(`/clinicas/${slug}/pacientes/verificado?${query.toString()}`);
}

export interface SolicitarTurnoPublicoResponse {
  /**
   * Prueba de mail NUEVA para la misma identidad que acabó de sacar este
   * turno (Fase 3.1). La que se mandó en el pedido se consumió;
   * esta permite que el cartel final ofrezca "¿querés sacar turno para
   * otro tipo?" sin volver a pedir el código de 6 dígitos.
   *
   * Hereda el vencimiento de la original, así que la ventana total no se
   * extiende. Ausente cuando el pedido vino por enlace o cuando a la
   * prueba original ya no le quedaba tiempo — ahí el botón no se ofrece.
   */
  verificacionToken?: string;
  id: string;
  horaInicio: string;
  horaFin: string;
}

// Formulario público de pedido de turno (spec §4.4, Extra 2.3.5) — sin
// autenticación, crea el turno directamente `agendado` en paralelo al
// envío por WhatsApp que arma el frontend (TR-003).
export function apiSolicitarTurnoPublico(
  slug: string,
  payload: SolicitarTurnoPublicoPayload,
): Promise<ApiResult<SolicitarTurnoPublicoResponse>> {
  return request<SolicitarTurnoPublicoResponse>(`/clinicas/${slug}/turnos`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface MisTurnoPublico {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  tipoConsultaNombre: string;
  nombreContacto: string;
  apellidoContacto: string;
}

// apiMisTurnoPublico — botón "Mis turnos" de la página pública (pedido
// textual del cliente): sin código de verificación de por medio (a
// diferencia de "ya he venido antes") — DNI+mail directo, la mitigación
// contra abuso es el rate limit por IP del lado del backend.
export function apiMisTurnoPublico(slug: string, dni: string, email: string): Promise<ApiResult<MisTurnoPublico>> {
  const query = new URLSearchParams({ dni, email });
  return request<MisTurnoPublico>(`/clinicas/${slug}/mis-turnos?${query.toString()}`);
}

// --- Auth/onboarding (docs/Login/feature-sumarte-login.md) ---
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

// --- F2.3: ajustes de calendario (docs/Arquitectura y base/implementation-plan.md §11.3) ---

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
  // TR-104: `pendiente` se sacó del todo — solo agendado/cancelada.
  estado?: "agendado" | "cancelada";
  desde?: string;
  hasta?: string;
  q?: string;
  // resuelto (2026-08-23): separa, dentro de estado=agendado, los turnos
  // cuya hora de fin ya pasó (pestaña "Resueltos" de la vista Turnos) —
  // sin esto, estado=agendado sigue trayendo pasados y futuros juntos
  // (lo que necesita el calendario).
  resuelto?: boolean;
  // tipoConsultaId (corrección de QA, Extra 2.3.3: "faltó el filtro de
  // tipo de consulta" en la vista Turnos) — filtra por columna exacta.
  tipoConsultaId?: string;
  // verificacion (corrección de seguridad, Fase 2.4.1) — "verificado" o
  // "sin_verificar", según si el paciente vinculado ya demostró ser real.
  verificacion?: "verificado" | "sin_verificar";
}

function queryDeTurnos(params: ListarTurnosParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.estado) query.set("estado", params.estado);
  if (params.desde) query.set("desde", params.desde);
  if (params.hasta) query.set("hasta", params.hasta);
  if (params.q) query.set("q", params.q);
  if (params.resuelto !== undefined) query.set("resuelto", String(params.resuelto));
  if (params.tipoConsultaId) query.set("tipoConsultaId", params.tipoConsultaId);
  if (params.verificacion) query.set("verificacion", params.verificacion);
  return query;
}

export function apiListTurnos(token: string, params: ListarTurnosParams = {}): Promise<ApiResult<Turno[]>> {
  const qs = queryDeTurnos(params).toString();
  return request<Turno[]>(`/turnos${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
}

// apiListTurnosPaginado — la variante que usa la VISTA DE LISTA
// (/panel/turnos) con "Cargar más". El calendario sigue usando
// apiListTurnos sin paginar a propósito: pide un rango de fechas acotado
// y necesita verlo completo — paginarlo le escondería turnos del rango
// visible. Ver internal/http/paginacion.go en el backend.
export function apiListTurnosPaginado(
  token: string,
  params: ListarTurnosParams,
  limit: number,
  offset: number,
): Promise<ApiResult<Pagina<Turno>>> {
  const query = queryDeTurnos(params);
  query.set("limit", String(limit));
  query.set("offset", String(offset));
  return requestPaginado<Turno>(`/turnos?${query.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
}

// apiContarTurnos — SOLO el total detrás de un filtro, sin traer las
// filas. Pide una página de 1 y se queda con el X-Total-Count: el total
// lo calcula el backend con un COUNT(*) aparte (paginacion.go), así que
// el body es una fila en vez de la lista completa.
//
// Lo usan los contadores de las pestañas de /panel/turnos ("Confirmadas
// 8", "Resueltos 4"...). Antes esa cuenta salía de pedir las 4 listas
// enteras y hacer `.length` — el costo que esta función elimina.
export async function apiContarTurnos(token: string, params: ListarTurnosParams): Promise<number> {
  const res = await apiListTurnosPaginado(token, params, 1, 0);
  return res.ok ? res.data.total : 0;
}

export interface CrearTurnoManualPayload {
  nombreContacto: string;
  apellidoContacto: string;
  dniContacto: string;
  // telefonoContacto — obligatorio sin tutor; opcional con tutor (Fase
  // 2.4.2, mismo criterio que el wizard público: en "para otro" el
  // teléfono es del paciente, no de quien lo trae, y puede no tenerlo).
  telefonoContacto?: string;
  emailContacto?: string;
  motivo?: string;
  tipoConsultaId: string;
  horaInicio: string;
  horaFin: string;
  // Camino "paciente conocido" (2026-08-23): vincula el turno nuevo a un
  // paciente que ya existe en vez de crear una ficha duplicada.
  pacienteId?: string;
  // paraOtro/tutor* (Fase 2.4.2) — opción "Con tutor" del alta de
  // "paciente nuevo" en "+ Agregar turno". Sin efecto si pacienteId viene
  // seteado (camino "paciente conocido").
  paraOtro?: boolean;
  tutorRelacion?: string;
  tutorNombre?: string;
  tutorTelefono?: string;
  tutorEmail?: string;
}

// Camino "paciente nuevo" del modal "+ Agregar turno" (spec §4.3).
export function apiCrearTurnoManual(token: string, payload: CrearTurnoManualPayload): Promise<ApiResult<Turno>> {
  return request<Turno>("/turnos", {
    method: "POST",
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
// (esos se corrigen desde "Editar paciente", TR-104).
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

// T2.2 (F2.3 extra ítem 1 lo reescribe de punta a punta, docs/Arquitectura y base/implementation-plan.md
// §11.5): datos de las 5 tarjetas del dashboard "Turnero".
export function apiResumenPanel(token: string): Promise<ApiResult<ResumenPanel>> {
  return request<ResumenPanel>("/panel/resumen", { headers: { Authorization: `Bearer ${token}` } });
}

// apiPanelNotificaciones — TR-108 (docs/Fases post MVP/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md):
// fuente de datos del aviso global de conflictos (fuera de Pacientes/
// Calendario) — ver NotificacionesConflictoGlobal.
export function apiPanelNotificaciones(token: string): Promise<ApiResult<PanelNotificacionesResponse>> {
  return request<PanelNotificacionesResponse>("/panel/notificaciones", { headers: { Authorization: `Bearer ${token}` } });
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

// apiCancelarTurnosSinVerificar (corrección de seguridad, Fase 2.4.1) —
// "cómo se hace para borrar todos los turnos sin verificar": cancela de
// una todos los turnos vigentes de pacientes que todavía no demostraron
// ser reales, acción del filtro "Sin verificar" en /panel/turnos.
export interface CancelarTurnosSinVerificarResponse {
  cancelados: number;
}

export function apiCancelarTurnosSinVerificar(token: string): Promise<ApiResult<CancelarTurnosSinVerificarResponse>> {
  return request<CancelarTurnosSinVerificarResponse>("/turnos/cancelar-sin-verificar", {
    method: "POST",
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

// apiTurnosPendientesAsistencia — TR-107 (1.3ter): fuente de datos de
// AsistenciaCartelGlobal. Sin ningún parámetro de fecha a propósito — ver
// el comentario grande en turnosPendientesAsistenciaResponse (Go).
export function apiTurnosPendientesAsistencia(token: string): Promise<ApiResult<TurnosPendientesAsistenciaResponse>> {
  return request<TurnosPendientesAsistenciaResponse>("/turnos/pendientes-asistencia", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// T3.5: tabla de pacientes, buscador por nombre/apellido/DNI.
export function apiListPacientes(token: string, q?: string): Promise<ApiResult<Paciente[]>> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return request<Paciente[]>(`/pacientes${qs}`, { headers: { Authorization: `Bearer ${token}` } });
}

// ListarPacientesParams — `verificacion` es el filtro de las pestañas
// Todos/Verificados/Sin verificar de /panel/pacientes. Hasta la
// paginación se resolvía en el navegador sobre la lista completa; con
// tandas parciales eso mostraría cualquier cosa, así que ahora lo
// resuelve el backend (mismo parámetro y misma subquery que ya usaba
// /turnos, ver listPacientesHandler en Go).
export interface ListarPacientesParams {
  q?: string;
  verificacion?: "verificado" | "sin_verificar";
}

// apiListPacientesPaginado — mismo criterio que apiListTurnosPaginado: lo
// usa la vista de lista de Pacientes con "Cargar más".
export function apiListPacientesPaginado(
  token: string,
  params: ListarPacientesParams,
  limit: number,
  offset: number,
): Promise<ApiResult<Pagina<Paciente>>> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.verificacion) query.set("verificacion", params.verificacion);
  query.set("limit", String(limit));
  query.set("offset", String(offset));
  return requestPaginado<Paciente>(`/pacientes?${query.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
}

// apiContarPacientes — igual que apiContarTurnos, para las pestañas
// Todos/Verificados/Sin verificar de /panel/pacientes.
export async function apiContarPacientes(token: string, params: ListarPacientesParams): Promise<number> {
  const res = await apiListPacientesPaginado(token, params, 1, 0);
  return res.ok ? res.data.total : 0;
}

export interface CrearPacientePayload {
  nombre: string;
  apellido: string;
  dni: string;
  // telefono — obligatorio sin tutor; opcional con tutor (Fase 2.4.2,
  // mismo criterio que el wizard público: "para otro" lo deja opcional,
  // es del paciente, no de quien lo trae).
  telefono?: string;
  email?: string;
  // conTutor/tutor* (Fase 2.4.2) — opción "Con tutor" del alta directa
  // desde el panel.
  conTutor?: boolean;
  tutorRelacion?: string;
  tutorNombre?: string;
  tutorTelefono?: string;
  tutorEmail?: string;
}

// "+ Agregar paciente" (Extra 2.3.5, E5.5): alta directa sin pasar por un
// turno. A diferencia del alta que ocurre de rebote al agendar (que reusa
// un paciente existente por DNI, turnos.go), acá un DNI repetido es un
// error real — el backend lo rechaza con 409 en vez de reusar en silencio
// una ficha que el profesional no eligió.
export function apiCrearPaciente(token: string, payload: CrearPacientePayload): Promise<ApiResult<Paciente>> {
  return request<Paciente>("/pacientes", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
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

// apiListConflictosPaciente/apiResolverConflictoPaciente (Fase 2.4.1) —
// pantalla de resolución de conflictos en /panel/pacientes: dos fichas
// compitiendo por el mismo DNI porque el mail no coincidía con el de una
// ficha ya VERIFICADA (ver crearPacientePublicoConDeteccionDeConflicto,
// backend).
export function apiListConflictosPaciente(token: string): Promise<ApiResult<ConflictoPaciente[]>> {
  return request<ConflictoPaciente[]>("/pacientes/conflictos", { headers: { Authorization: `Bearer ${token}` } });
}

export interface ResolverConflictoPacientePayload {
  // esVerificado — true: "el mail es de la persona verificada"; false:
  // "el mail no es del paciente verificado". Ver resolverConflictoPacienteHandler.
  esVerificado: boolean;
}

export function apiResolverConflictoPaciente(
  token: string,
  conflictoId: string,
  payload: ResolverConflictoPacientePayload,
): Promise<ApiResult<{ mensaje: string }>> {
  return request<{ mensaje: string }>(`/pacientes/conflictos/${conflictoId}/resolver`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// apiListBloqueosSeguridad/apiDesbloquearMail/apiDesbloquearIP —
// corrección de seguridad (Fase 2.4.1): "el apartado de auditoría de
// turnos de bloqueos, donde muestre los mails bloqueados etc, por las
// dudas de algún malentendido" — /panel/seguridad.
export function apiListBloqueosSeguridad(token: string): Promise<ApiResult<BloqueosSeguridad>> {
  return request<BloqueosSeguridad>("/pacientes/seguridad/bloqueos", { headers: { Authorization: `Bearer ${token}` } });
}

export function apiDesbloquearMail(token: string, id: string): Promise<ApiResult<{ mensaje: string }>> {
  return request<{ mensaje: string }>(`/pacientes/seguridad/bloqueos-mail/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function apiDesbloquearIP(token: string, id: string): Promise<ApiResult<{ mensaje: string }>> {
  return request<{ mensaje: string }>(`/pacientes/seguridad/bloqueos-ip/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
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
