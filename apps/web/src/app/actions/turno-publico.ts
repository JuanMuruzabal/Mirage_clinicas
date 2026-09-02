"use server";

import {
  apiConfirmarVerificacionTurnoPublico,
  apiEnviarVerificacionTurnoPublico,
  apiListDisponibilidadPublica,
  apiListTiposConsultaPublico,
  apiSolicitarTurnoPublico,
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
}

// enviarVerificacionEmailAction — Extra 2.3.5 (E5.6), "Confirmanos que sos
// vos": primer paso después de los datos de contacto — manda un código de
// 6 dígitos al mail que puso. Se usa tanto para el envío inicial como para
// "Reenviar código" (misma acción, el backend decide si corresponde por
// el cooldown de 60s).
export async function enviarVerificacionEmailAction(slug: string, email: string): Promise<EnviarVerificacionEmailResult> {
  const result = await apiEnviarVerificacionTurnoPublico(slug, email);
  if (!result.ok) {
    return { error: result.error };
  }
  return { ok: true };
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
