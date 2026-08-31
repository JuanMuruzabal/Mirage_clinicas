"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BloqueoHorario, Disponibilidad, HorarioAtencion, TipoConsulta } from "@dental-mirage/shared-types";
import {
  apiCrearBloqueo,
  apiCrearHorarioAtencion,
  apiCrearTipoConsulta,
  apiEditarBloqueo,
  apiEditarHorarioAtencion,
  apiEditarTipoConsulta,
  apiEliminarBloqueo,
  apiEliminarHorarioAtencion,
  apiEliminarTipoConsulta,
  apiListBloqueos,
  apiListDisponibilidad,
  apiListHorarioAtencion,
  apiListTiposConsulta,
  apiPutHorarioAtencionGeneral,
  type CrearBloqueoPayload,
  type CrearHorarioAtencionPayload,
  type PutHorarioAtencionGeneralPayload,
  type TipoConsultaPayload,
} from "@/lib/api";
import { getSessionToken } from "@/lib/session";

// Server Actions de "Configuración de calendario" (F2.3, docs/implementation-plan.md
// §11.3) — todas siguen el mismo patrón que actions/pacientes.ts y
// actions/turnos.ts: token de la cookie, redirect a /ingresar si no hay
// sesión, y un shape `{ error }` en el camino de falla para que el
// Client Component no necesite tocar apps/api directo.

export interface CalendarioConfigActionResult {
  error: string;
}

// listHorarioAtencionAction (rediseño 2026-09-01, corrección de QA:
// "puede que un profesional tenga horarios de atención variable") — la
// LISTA completa, la general primero (sintetizada por default si la
// clínica todavía no guardó nada); reemplaza getHorarioAtencionAction.
export async function listHorarioAtencionAction(): Promise<HorarioAtencion[]> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiListHorarioAtencion(token);
  return result.ok ? result.data : [{ id: "", alcance: "general", horaDesde: "08:00", horaHasta: "18:00" }];
}

export async function putHorarioAtencionGeneralAction(
  payload: PutHorarioAtencionGeneralPayload,
): Promise<CalendarioConfigActionResult | { horario: HorarioAtencion }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiPutHorarioAtencionGeneral(token, payload);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { horario: result.data };
}

export async function crearHorarioAtencionAction(
  payload: CrearHorarioAtencionPayload,
): Promise<CalendarioConfigActionResult | { horario: HorarioAtencion }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiCrearHorarioAtencion(token, payload);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { horario: result.data };
}

export async function editarHorarioAtencionAction(
  id: string,
  payload: CrearHorarioAtencionPayload,
): Promise<CalendarioConfigActionResult | { horario: HorarioAtencion }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiEditarHorarioAtencion(token, id, payload);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { horario: result.data };
}

export async function eliminarHorarioAtencionAction(id: string): Promise<CalendarioConfigActionResult | { ok: true }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiEliminarHorarioAtencion(token, id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { ok: true };
}

export async function listBloqueosAction(especifico?: boolean): Promise<BloqueoHorario[]> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiListBloqueos(token, especifico);
  return result.ok ? result.data : [];
}

export async function crearBloqueoAction(
  payload: CrearBloqueoPayload,
): Promise<CalendarioConfigActionResult | { bloqueo: BloqueoHorario }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiCrearBloqueo(token, payload);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { bloqueo: result.data };
}

export async function editarBloqueoAction(
  id: string,
  payload: CrearBloqueoPayload,
): Promise<CalendarioConfigActionResult | { bloqueo: BloqueoHorario }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiEditarBloqueo(token, id, payload);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { bloqueo: result.data };
}

export async function eliminarBloqueoAction(id: string): Promise<CalendarioConfigActionResult | { ok: true }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiEliminarBloqueo(token, id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { ok: true };
}

// listDisponibilidadAction — corrección de QA sobre F2.3 (adelanta parte
// de F2.4.1/TR-079): horarios elegibles de verdad para "+ Agregar
// turno"/"Editar turno" — ya no un <input type="time"> libre.
export async function listDisponibilidadAction(
  tipoConsultaId: string,
  fecha: string,
  excluirTurnoId?: string,
): Promise<Disponibilidad> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiListDisponibilidad(token, tipoConsultaId, fecha, excluirTurnoId);
  return result.ok ? result.data : { slots: [] };
}

// listTiposConsultaAction — F2.3.7: la sección de tipos de consulta del
// modal de configuración necesita su propia copia client-side (antes
// solo se pedía server-side, en app/panel/calendario/page.tsx, para
// pasarla como prop de solo lectura a CalendarView/CalendarGrid).
export async function listTiposConsultaAction(): Promise<TipoConsulta[]> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiListTiposConsulta(token);
  return result.ok ? result.data : [];
}

export async function crearTipoConsultaAction(
  payload: TipoConsultaPayload,
): Promise<CalendarioConfigActionResult | { tipoConsulta: TipoConsulta }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiCrearTipoConsulta(token, payload);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { tipoConsulta: result.data };
}

export async function editarTipoConsultaAction(
  id: string,
  payload: TipoConsultaPayload,
): Promise<CalendarioConfigActionResult | { tipoConsulta: TipoConsulta }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiEditarTipoConsulta(token, id, payload);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { tipoConsulta: result.data };
}

export async function eliminarTipoConsultaAction(id: string): Promise<CalendarioConfigActionResult | { ok: true }> {
  const token = await getSessionToken();
  if (!token) redirect("/ingresar");
  const result = await apiEliminarTipoConsulta(token, id);
  if (!result.ok) return { error: result.error };
  revalidatePath("/panel/calendario");
  return { ok: true };
}
