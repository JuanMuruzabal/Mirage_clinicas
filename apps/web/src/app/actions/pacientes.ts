"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ConflictoPaciente, Paciente } from "@dental-mirage/shared-types";
import {
  apiCrearPaciente,
  apiEditarPaciente,
  apiListConflictosPaciente,
  apiListPacientes,
  apiResolverConflictoPaciente,
  type CrearPacientePayload,
  type EditarPacientePayload,
} from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export interface PacienteActionResult {
  error: string;
}

// listPacientesAction — camino "Paciente conocido" del modal "+ Agregar
// turno" (2026-08-23): busca entre los pacientes ya cargados del
// profesional para agendarles un turno nuevo sin volver a tipear sus
// datos. Mismo patrón que listTurnosAction: el cliente HTTP es
// server-only, así que esta Server Action es la única vía desde un Client
// Component.
export async function listPacientesAction(q?: string): Promise<Paciente[]> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiListPacientes(token, q);
  return result.ok ? result.data : [];
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
