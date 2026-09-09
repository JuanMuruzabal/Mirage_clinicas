"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Turno } from "@dental-mirage/shared-types";
import type { AutoreservarTurnosResponse, TurnosPendientesAsistenciaResponse } from "@dental-mirage/shared-types";
import {
  apiAutoreservarTurnos,
  apiCancelarTurno,
  apiCancelarTurnosSinVerificar,
  apiCrearEnlaceTurno,
  apiCrearTurnoManual,
  apiListTurnos,
  apiListTurnosPaginado,
  apiMarcarAsistencia,
  apiReprogramarTurno,
  apiTurnosPendientesAsistencia,
  type CrearTurnoManualPayload,
  type ListarTurnosParams,
  type Pagina,
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

// listTurnosPaginadoAction — la variante que usa la VISTA DE LISTA
// (/panel/turnos) con "Cargar más" (Fase B de la auditoría). El
// calendario sigue con listTurnosAction sin paginar A PROPÓSITO: pide un
// rango de fechas acotado y necesita verlo COMPLETO — paginarlo le
// escondería turnos del rango visible.
//
// Ante un error devuelve una página vacía con total 0, mismo criterio que
// listTurnosAction: la tabla se muestra vacía en vez de romper la
// pantalla entera.
export async function listTurnosPaginadoAction(
  params: ListarTurnosParams,
  limit: number,
  offset: number,
): Promise<Pagina<Turno>> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiListTurnosPaginado(token, params, limit, offset);
  return result.ok ? result.data : { items: [], total: 0 };
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

// crearEnlaceTurnoAction — modal "+ Agregar turno" → "Compartir link de
// turnero" (Fase 2, ítem 5): genera el link de 1h. Sin revalidatePath —
// generar un link no cambia ningún dato visible en el panel.
export async function crearEnlaceTurnoAction(): Promise<TurnoActionResult | { url: string; expiraEn: string }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiCrearEnlaceTurno(token);
  if (!result.ok) {
    return { error: result.error };
  }
  return result.data;
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

// cancelarTurnosSinVerificarAction (corrección de seguridad, Fase 2.4.1)
// — botón "Cancelar todos" del filtro "Sin verificar" en /panel/turnos.
export async function cancelarTurnosSinVerificarAction(): Promise<TurnoActionResult | { cancelados: number }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiCancelarTurnosSinVerificar(token);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/calendario");
  return { cancelados: result.data.cancelados };
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

// turnosPendientesAsistenciaAction — TR-107 (1.3ter): fuente de datos de
// AsistenciaCartelGlobal. Nunca redirige a /ingresar sin sesión (a
// diferencia del resto de las acciones de este archivo) — el cartel
// sondea desde un componente montado en todo el panel; si por lo que sea
// se llama sin token, devolver "nada pendiente" es más seguro que forzar
// una navegación desde un efecto en segundo plano.
export async function turnosPendientesAsistenciaAction(): Promise<TurnosPendientesAsistenciaResponse> {
  const token = await getSessionToken();
  if (!token) {
    return { vencidos: [], proximoVencimiento: null };
  }
  const result = await apiTurnosPendientesAsistencia(token);
  return result.ok ? result.data : { vencidos: [], proximoVencimiento: null };
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
