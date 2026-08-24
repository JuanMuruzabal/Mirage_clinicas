"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiLogin, apiRegister, apiUpdateMe } from "@/lib/api";
import type { LoginPayload, RegisterPayload, UpdateMePayload } from "@/lib/api";
import { clearSessionCookie, getSessionToken, setSessionCookie } from "@/lib/session";

export interface ActionResult {
  error: string;
}

// registerAction — T1.3/T1.2: todo el wizard de alta (datos personales,
// especialidades, nombre de clínica) se envía junto acá, en un solo
// request al backend — ver docs/tradeoffs.md sobre por qué el registro no
// se parte en llamadas intermedias por paso.
export async function registerAction(payload: RegisterPayload): Promise<ActionResult | undefined> {
  const result = await apiRegister(payload);
  if (!result.ok) {
    return { error: result.error };
  }
  await setSessionCookie(result.data.token);
  redirect("/seleccionar-servicio");
}

export async function loginAction(payload: LoginPayload): Promise<ActionResult | undefined> {
  const result = await apiLogin(payload);
  if (!result.ok) {
    return { error: result.error };
  }
  await setSessionCookie(result.data.token);
  redirect("/seleccionar-servicio");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}

// updateMeAction — T1.5 ("Tu perfil"): reemplaza nombre/teléfono/
// especialidades del profesional autenticado.
export async function updateMeAction(payload: UpdateMePayload): Promise<ActionResult | undefined> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }

  const result = await apiUpdateMe(token, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/perfil");
}
