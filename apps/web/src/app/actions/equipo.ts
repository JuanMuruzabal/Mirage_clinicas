"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClinicRole, InvitarColaboradorPayload } from "@dental-mirage/shared-types";
import {
  apiAceptarInvitacion,
  apiCambiarRoles,
  apiCancelarInvitacion,
  apiInvitarColaborador,
  apiQuitarColaborador,
  apiRechazarInvitacion,
  apiReenviarInvitacion,
} from "@/lib/api";
import { getSessionToken } from "@/lib/session";

// Acciones del equipo de la clínica — Fase 3.2.4.

export interface ResultadoEquipo {
  error?: string;
}

async function tokenOIngresar(): Promise<string> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  return token;
}

export async function invitarColaboradorAction(payload: InvitarColaboradorPayload): Promise<ResultadoEquipo> {
  const token = await tokenOIngresar();
  const result = await apiInvitarColaborador(token, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/colaboradores");
  return {};
}

export async function reenviarInvitacionAction(id: string): Promise<ResultadoEquipo> {
  const token = await tokenOIngresar();
  const result = await apiReenviarInvitacion(token, id);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/colaboradores");
  return {};
}

export async function cancelarInvitacionAction(id: string): Promise<ResultadoEquipo> {
  const token = await tokenOIngresar();
  const result = await apiCancelarInvitacion(token, id);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/colaboradores");
  return {};
}

// cambiarRolesAction — se manda el juego COMPLETO de roles, no un
// agregado: con roles excluyentes entre sí, "sumale profesional" a quien
// es recepción no tiene una respuesta obvia.
export async function cambiarRolesAction(userId: string, roles: ClinicRole[]): Promise<ResultadoEquipo> {
  const token = await tokenOIngresar();
  const result = await apiCambiarRoles(token, userId, roles);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/colaboradores");
  return {};
}

export async function quitarColaboradorAction(userId: string): Promise<ResultadoEquipo> {
  const token = await tokenOIngresar();
  const result = await apiQuitarColaborador(token, userId);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/colaboradores");
  return {};
}

// aceptarInvitacionAction — el lado del invitado, desde /clinicas.
//
// Invalida el layout raíz, no solo la página: aceptar cambia de cuántas
// clínicas es parte esta persona, y eso lo lee el header.
export async function aceptarInvitacionAction(id: string): Promise<ResultadoEquipo> {
  const token = await tokenOIngresar();
  const result = await apiAceptarInvitacion(token, id);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function rechazarInvitacionAction(id: string): Promise<ResultadoEquipo> {
  const token = await tokenOIngresar();
  const result = await apiRechazarInvitacion(token, id);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/clinicas");
  return {};
}
