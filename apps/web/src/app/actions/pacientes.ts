"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Paciente } from "@dental-mirage/shared-types";
import { apiEditarPaciente, apiListPacientes, type EditarPacientePayload } from "@/lib/api";
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
