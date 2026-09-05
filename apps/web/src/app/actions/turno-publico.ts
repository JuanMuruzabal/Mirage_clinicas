"use server";

import {
  apiConfirmarVerificacionTurnoPublico,
  apiEnviarVerificacionTurnoPublico,
  apiGetPacienteVerificadoPublico,
  apiListDisponibilidadPublica,
  apiListTiposConsultaPublico,
  apiMisTurnoPublico,
  apiSolicitarTurnoPublico,
  type MisTurnoPublico,
  type PacienteVerificadoPublico,
  type SolicitarTurnoPublicoPayload,
  type TipoConsultaPublico,
} from "@/lib/api";
import type { Disponibilidad } from "@dental-mirage/shared-types";

export interface SolicitarTurnoPublicoResult {
  error?: string;
  id?: string;
  horaInicio?: string;
  horaFin?: string;
}

// listTiposConsultaPublicoAction — primer paso del wizard público después
// de los datos de contacto (Extra 2.3.5, E5.3): qué tipos de consulta
// ofrece la clínica. Sin sesión — cualquier visitante de la página pública
// la puede llamar.
export async function listTiposConsultaPublicoAction(slug: string): Promise<TipoConsultaPublico[]> {
  const result = await apiListTiposConsultaPublico(slug);
  return result.ok ? result.data : [];
}

// listDisponibilidadPublicaAction — mismo cálculo que
// listDisponibilidadAction (autenticado, usa el profesional desde el
// panel), reusado para el wizard público (E5.3).
export async function listDisponibilidadPublicaAction(
  slug: string,
  tipoConsultaId: string,
  fecha: string,
): Promise<Disponibilidad> {
  const result = await apiListDisponibilidadPublica(slug, tipoConsultaId, fecha);
  return result.ok ? result.data : { slots: [] };
}

export interface EnviarVerificacionEmailResult {
  error?: string;
  ok?: boolean;
  // codigoDev (Fase 2.4.1) — ver EnviarVerificacionTurnoPublicoResponse:
  // solo viene en local, nunca en producción.
  codigoDev?: string;
}

// enviarVerificacionEmailAction — Extra 2.3.5 (E5.6), "Confirmanos que sos
// vos": primer paso después de los datos de contacto — manda un código de
// 6 dígitos al mail que puso. Se usa tanto para el envío inicial como para
// "Reenviar código" (misma acción, el backend decide si corresponde por
// el cooldown de 60s). `captchaToken` (corrección de seguridad, Fase
// 2.4.1) viene del widget de Turnstile en el propio formulario — este es
// el único punto de entrada de todo el flujo público de turnos, así que
// es donde tiene que frenar la automatización.
export async function enviarVerificacionEmailAction(slug: string, email: string, captchaToken: string): Promise<EnviarVerificacionEmailResult> {
  const result = await apiEnviarVerificacionTurnoPublico(slug, email, captchaToken);
  if (!result.ok) {
    return { error: result.error };
  }
  return { ok: true, codigoDev: result.data.codigoDev };
}

export interface ConfirmarVerificacionEmailResult {
  error?: string;
  token?: string;
}

// confirmarVerificacionEmailAction — Extra 2.3.5 (E5.6): valida el código
// de 6 dígitos y devuelve el token de prueba que el resto del wizard
// manda junto con el pedido de turno final (solicitarTurnoPublicoAction).
export async function confirmarVerificacionEmailAction(slug: string, email: string, codigo: string): Promise<ConfirmarVerificacionEmailResult> {
  const result = await apiConfirmarVerificacionTurnoPublico(slug, email, codigo);
  if (!result.ok) {
    return { error: result.error };
  }
  return { token: result.data.token };
}

export interface PacienteVerificadoPublicoResult {
  error?: string;
  paciente?: PacienteVerificadoPublico;
}

// pacienteVerificadoPublicoAction — Fase 2.4.1, camino "ya he venido
// antes" del wizard: busca la "tarjeta clickeable" para el DNI/mail ya
// verificados con el código de 6 dígitos. Un 404 no es un error de
// verdad — significa "no encontramos una ficha verificada con esos
// datos", y el wizard lo interpreta como una invitación a empezar como
// paciente nuevo, así que se devuelve como `error` para que el
// componente decida qué mostrar.
export async function pacienteVerificadoPublicoAction(
  slug: string,
  dni: string,
  email: string,
  verificacionToken: string,
): Promise<PacienteVerificadoPublicoResult> {
  const result = await apiGetPacienteVerificadoPublico(slug, dni, email, verificacionToken);
  if (!result.ok) {
    return { error: result.error };
  }
  return { paciente: result.data };
}

// solicitarTurnoPublicoAction — formulario público de pedido de turno
// (spec §4.4, Extra 2.3.5): sin sesión, cualquier visitante de la página de
// una clínica lo puede completar. Reescrito para E5.2/E5.3: el paciente
// elige tipo de consulta, fecha y horario disponible antes de confirmar —
// el turno nace `agendado`, con horario real, nunca más `pendiente`. El
// link de WhatsApp (TR-003) lo arma el componente cliente después de un
// resultado exitoso, con el teléfono de la clínica que ya tiene cargado —
// esta acción solo persiste el pedido.
export async function solicitarTurnoPublicoAction(
  slug: string,
  payload: SolicitarTurnoPublicoPayload,
): Promise<SolicitarTurnoPublicoResult> {
  const result = await apiSolicitarTurnoPublico(slug, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  return { id: result.data.id, horaInicio: result.data.horaInicio, horaFin: result.data.horaFin };
}

export interface MisTurnoPublicoResult {
  error?: string;
  turno?: MisTurnoPublico;
}

// misTurnoPublicoAction — botón "Mis turnos" de la página pública (pedido
// textual del cliente): DNI+mail directo, sin código de verificación. Un
// 404 no es un error real — "no encontramos ningún turno activo con esos
// datos" — se devuelve como `error` para que el formulario lo muestre tal
// cual.
export async function misTurnoPublicoAction(slug: string, dni: string, email: string): Promise<MisTurnoPublicoResult> {
  const result = await apiMisTurnoPublico(slug, dni, email);
  if (!result.ok) {
    return { error: result.error };
  }
  return { turno: result.data };
}
