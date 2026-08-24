"use server";

import { apiSolicitarTurnoPublico, type SolicitarTurnoPublicoPayload } from "@/lib/api";

export interface SolicitarTurnoPublicoResult {
  error?: string;
  id?: string;
}

// solicitarTurnoPublicoAction — formulario público de pedido de turno
// (spec §4.4, T3.1/T3.2): sin sesión, cualquier visitante de la página de
// una clínica lo puede completar. El link de WhatsApp (TR-003) lo arma el
// componente cliente después de un resultado exitoso, con el teléfono de
// la clínica que ya tiene cargado — esta acción solo persiste el pedido.
export async function solicitarTurnoPublicoAction(
  slug: string,
  payload: SolicitarTurnoPublicoPayload,
): Promise<SolicitarTurnoPublicoResult> {
  const result = await apiSolicitarTurnoPublico(slug, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  return { id: result.data.id };
}
