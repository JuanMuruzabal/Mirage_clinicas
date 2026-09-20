"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ConflictoPaciente, Paciente, PacienteConocido } from "@dental-mirage/shared-types";
import {
  apiCrearPaciente,
  apiEditarPaciente,
  apiListConflictosPaciente,
  apiListPacientes,
  apiPacientesDeLaClinica,
  apiSumarPacienteAMiLista,
  apiListPacientesPaginado,
  apiResolverConflictoPaciente,
  type CrearPacientePayload,
  type EditarPacientePayload,
  type ListarPacientesParams,
  type Pagina,
} from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export interface PacienteActionResult {
  error: string;
}

// listPacientesAction — camino "Paciente conocido" del modal "+ Agregar
// turno" (2026-08-23): busca una ficha ya cargada para agendarle un turno
// nuevo sin volver a tipear sus datos. Mismo patrón que listTurnosAction:
// el cliente HTTP es server-only, así que esta Server Action es la única
// vía desde un Client Component.
//
// Busca en TODA LA CLÍNICA desde la Fase 3.2.5 (pedido del cliente,
// 2026-09-15): la identidad de un paciente es de la clínica —una persona,
// una ficha, un DNI— así que quien va a cargarle un turno tiene que poder
// encontrarla la haya cargado quien la haya cargado. Antes buscaba solo
// entre los propios, y el resultado era que un profesional tipeaba de
// nuevo a alguien que ya existía: el índice único de DNI rechazaba el
// alta y no había forma de engancharla desde esta pantalla.
//
// El listado de /panel/pacientes NO cambia: sigue siendo "a quiénes
// atiendo yo", que es otra pregunta.
// sumarPacienteAMiListaAction — "+ Agregar paciente > De la clínica".
// Devuelve el error para que la pantalla lo muestre: agregar a alguien a
// tu lista y que no pase nada, sin decir por qué, es peor que fallar.
export async function sumarPacienteAMiListaAction(pacienteId: string): Promise<{ error?: string; ok?: boolean }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiSumarPacienteAMiLista(token, pacienteId);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel/pacientes");
  return { ok: true };
}

export async function listPacientesAction(q?: string): Promise<PacienteConocido[]> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiPacientesDeLaClinica(token, q);
  return result.ok ? result.data : [];
}

// listPacientesPaginadoAction — la variante que usa el LISTADO de
// /panel/pacientes con "Cargar más" (Fase B de la auditoría). El
// buscador del modal "+ Agregar turno" sigue con listPacientesAction sin
// paginar: ahí el filtro por texto ya acota el resultado a un puñado de
// fichas, y una tanda parcial de coincidencias confundiría más de lo que
// ayuda.
export async function listPacientesPaginadoAction(
  params: ListarPacientesParams,
  limit: number,
  offset: number,
): Promise<Pagina<Paciente>> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiListPacientesPaginado(token, params, limit, offset);
  return result.ok ? result.data : { items: [], total: 0 };
}

// editarPacienteAction — ficha de paciente (2026-08-23): corrige DNI/
// teléfono/email si hubo un error o una actualización de datos.
export async function editarPacienteAction(
  pacienteId: string,
  payload: EditarPacientePayload,
): Promise<PacienteActionResult | { paciente: Paciente }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiEditarPaciente(token, pacienteId, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel/pacientes");
  revalidatePath(`/panel/pacientes/${pacienteId}`);
  return { paciente: result.data };
}

// crearPacienteAction — "+ Agregar paciente" (Extra 2.3.5, E5.5): alta
// directa en la sección Pacientes, sin pasar por un turno.
export async function crearPacienteAction(payload: CrearPacientePayload): Promise<PacienteActionResult | { paciente: Paciente }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiCrearPaciente(token, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel/pacientes");
  return { paciente: result.data };
}

// listConflictosPacienteAction — Fase 2.4.1: banner + pantalla de
// resolución de conflictos en /panel/pacientes. Un error de red se
// devuelve como lista vacía (mismo criterio que listPacientesAction) — el
// banner simplemente no aparece, no bloquea la pantalla.
export async function listConflictosPacienteAction(): Promise<ConflictoPaciente[]> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiListConflictosPaciente(token);
  return result.ok ? result.data : [];
}

// resolverConflictoPacienteAction — Fase 2.4.1: los dos botones de la
// pantalla de resolución ("el mail es de la persona verificada" / "el
// mail no es del paciente verificado").
export async function resolverConflictoPacienteAction(conflictoId: string, esVerificado: boolean): Promise<PacienteActionResult | { ok: true }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiResolverConflictoPaciente(token, conflictoId, { esVerificado });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel/pacientes");
  return { ok: true };
}
