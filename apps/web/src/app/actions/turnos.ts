"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Turno } from "@dental-mirage/shared-types";
import type { AutoreservarTurnosResponse } from "@dental-mirage/shared-types";
import {
  apiAgendarTurno,
  apiAutoreservarTurnos,
  apiCancelarTurno,
  apiCrearTurnoManual,
  apiEditarTurno,
  apiListTurnos,
  apiMarcarAsistencia,
  apiReprogramarTurno,
  type AgendarTurnoPayload,
  type CrearTurnoManualPayload,
  type EditarTurnoPayload,
  type ListarTurnosParams,
  type ReprogramarTurnoPayload,
} from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export interface TurnoActionResult {
  error: string;
}

// listTurnosAction — el calendario (T2.3) navega entre semanas/meses sin
// recargar la página; como el cliente HTTP hacia apps/api es server-only
// (spec §9.3, BFF sin excepciones), esta Server Action es la única forma
// de pedir datos nuevos desde el Client Component sin abrir un fetch
// directo al backend Go.
export async function listTurnosAction(params: ListarTurnosParams): Promise<Turno[]> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiListTurnos(token, params);
  return result.ok ? result.data : [];
}

// crearTurnoManualAction — modal "+ Agregar turno" (spec §4.3), camino
// "paciente nuevo".
export async function crearTurnoManualAction(payload: CrearTurnoManualPayload): Promise<TurnoActionResult | { turno: Turno }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiCrearTurnoManual(token, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel");
  revalidatePath("/panel/calendario");
  return { turno: result.data };
}

// agendarTurnoAction — modal "+ Agregar turno", camino "desde turnos
// pendientes".
export async function agendarTurnoAction(
  turnoId: string,
  payload: AgendarTurnoPayload,
): Promise<TurnoActionResult | { turno: Turno }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiAgendarTurno(token, turnoId, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel");
  revalidatePath("/panel/calendario");
  return { turno: result.data };
}

// cancelarTurnoAction — vista Turnos (T3.3), acción "Cancelar". Idempotente
// del lado del backend: cancelar dos veces no es un error.
export async function cancelarTurnoAction(turnoId: string): Promise<TurnoActionResult | { turno: Turno }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiCancelarTurno(token, turnoId);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/calendario");
  return { turno: result.data };
}

// editarTurnoAction — vista Turnos (T3.3), acción "Editar": corrige solo
// los datos de contacto, nunca horario ni tipo de consulta.
export async function editarTurnoAction(
  turnoId: string,
  payload: EditarTurnoPayload,
): Promise<TurnoActionResult | { turno: Turno }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiEditarTurno(token, turnoId, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/calendario");
  return { turno: result.data };
}

// marcarAsistenciaAction (pedido explícito del cliente, 2026-09-04): "los
// turnos resueltos ahora tienen la opción al ser tocados de marcar
// asistidos o ausente... opción marcable tanto en el calendario, como de
// la sección de turnos resueltos en la pestaña de turnos" — una sola
// Server Action para los dos lugares (TurnoDetalle y TurnosTable).
// Irreversible (corrección de QA, 2026-09-04, textual): "me debe aparecer
// un aviso que la elección es irreversible y confirmar esto" — cada
// caller pide esa confirmación ANTES de invocar esta acción; el backend
// además la hace cumplir de verdad (rechaza cualquier segundo intento).
export async function marcarAsistenciaAction(
  turnoId: string,
  asistencia: "asistio" | "ausente",
): Promise<TurnoActionResult | { turno: Turno }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiMarcarAsistencia(token, turnoId, asistencia);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/calendario");
  return { turno: result.data };
}

// reprogramarTurnoAction — "Editar" de un turno ya confirmado (2026-08-23):
// solo cambia el horario, nunca los datos de contacto.
export async function reprogramarTurnoAction(
  turnoId: string,
  payload: ReprogramarTurnoPayload,
): Promise<TurnoActionResult | { turno: Turno }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiReprogramarTurno(token, turnoId, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/calendario");
  return { turno: result.data };
}

// autoreservarTurnosAction — botón "Autoreservar turnos" del modal de
// conflicto (nueva función, pedido textual del cliente, 2026-09-08).
// `revalidatePath` acá (a diferencia de las demás acciones de este
// archivo) no alcanza para refrescar el calendario ya abierto en
// pantalla — es un Client Component con su propio estado de turnos
// (calendar-view.tsx), así que el caller además tiene que volver a pedir
// los turnos del rango visible después de un resultado OK (ver
// onReprogramados en bloqueo-detalle-modal.tsx).
export async function autoreservarTurnosAction(turnoIds: string[]): Promise<TurnoActionResult | AutoreservarTurnosResponse> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiAutoreservarTurnos(token, turnoIds);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/calendario");
  return result.data;
}
