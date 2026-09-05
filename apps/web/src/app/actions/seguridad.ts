"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BloqueosSeguridad } from "@dental-mirage/shared-types";
import { apiDesbloquearIP, apiDesbloquearMail, apiListBloqueosSeguridad } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export interface SeguridadActionResult {
  error: string;
}

// listBloqueosSeguridadAction — corrección de seguridad (Fase 2.4.1),
// pedido textual del cliente: "el apartado de auditoría de turnos de
// bloqueos, donde muestre los mails bloqueados etc, por las dudas de
// algún malentendido" — /panel/seguridad. Un error de red devuelve listas
// vacías (mismo criterio que listPacientesAction) en vez de romper la
// pantalla.
export async function listBloqueosSeguridadAction(): Promise<BloqueosSeguridad> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiListBloqueosSeguridad(token);
  return result.ok ? result.data : { mailsBloqueados: [], ipsBloqueadas: [], auditoria: [] };
}

// desbloquearMailAction/desbloquearIPAction — recuperar un falso positivo
// del bloqueo automático (ej. dos personas de una misma casa compartiendo
// mail). Los turnos que ya se borraron no se pueden recuperar, esto solo
// levanta el bloqueo hacia adelante.
export async function desbloquearMailAction(id: string): Promise<SeguridadActionResult | { ok: true }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiDesbloquearMail(token, id);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel/seguridad");
  return { ok: true };
}

export async function desbloquearIPAction(id: string): Promise<SeguridadActionResult | { ok: true }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiDesbloquearIP(token, id);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/panel/seguridad");
  return { ok: true };
}
