"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CodigoInvitacion } from "@dental-mirage/shared-types";
import { apiElegirClinicaActiva, apiGenerarCodigoInvitacion } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

// Acciones de "¿Dónde trabajás hoy?" (Fase 3.2.3) — el punto de partida
// de toda sesión.

export interface ActionResult {
  error?: string;
}

// ErrorDeCodigo tiene `error` OBLIGATORIO a propósito: es lo que permite
// distinguir con un `"error" in resultado` un código generado de un
// fallo. Con la propiedad opcional, TypeScript no puede descartar el
// caso de error en la otra rama.
interface ErrorDeCodigo {
  error: string;
}

// entrarEnClinicaAction — guarda la clínica elegida en la SESIÓN y entra.
//
// El `revalidatePath("/", "layout")` no es de rutina: media app lee
// `me.clinica` para saber dónde está parada (el header del panel, el
// enlace a la página pública, los listados). Sin invalidar el layout, se
// entraría a la clínica nueva con el nombre de la anterior todavía
// pintado en pantalla.
export async function entrarEnClinicaAction(clinicaId: string): Promise<ActionResult | undefined> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }

  const result = await apiElegirClinicaActiva(token, clinicaId);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/", "layout");
  redirect("/seleccionar-servicio");
}

export async function generarCodigoInvitacionAction(): Promise<CodigoInvitacion | ErrorDeCodigo> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }

  const result = await apiGenerarCodigoInvitacion(token);
  if (!result.ok) {
    return { error: result.error };
  }
  return result.data;
}
