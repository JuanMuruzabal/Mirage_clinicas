"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaginaPublica } from "@dental-mirage/shared-types";
import { apiDeployarPaginaPublica, apiOcultarPaginaPublica } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export interface PaginaPublicaActionResult {
  error: string;
}

// ocultarPaginaPublicaAction (T4.2, spec §5.2) — reversible en cualquier
// dirección, a diferencia de deployar.
export async function ocultarPaginaPublicaAction(
  oculta: boolean,
): Promise<PaginaPublicaActionResult | { pagina: PaginaPublica }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiOcultarPaginaPublica(token, { oculta });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/personalizar-pagina");
  return { pagina: result.data };
}

// deployarPaginaPublicaAction (T4.2, spec §5.2) — publica la página por
// primera vez; también revalida /buscar, porque a partir de acá la
// clínica ya puede aparecer en el buscador público (T4.5).
export async function deployarPaginaPublicaAction(): Promise<PaginaPublicaActionResult | { pagina: PaginaPublica }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiDeployarPaginaPublica(token);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/personalizar-pagina");
  revalidatePath("/buscar");
  return { pagina: result.data };
}
