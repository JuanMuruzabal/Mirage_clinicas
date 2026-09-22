"use server";

import { revalidatePath } from "next/cache";
import { apiActualizarAvalPaginaPublica } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export async function actualizarAvalPaginaPublicaAction(payload: { clinicId: string; avalPaginaPublica: boolean }) {
  if (!payload || typeof payload.clinicId !== "string" || payload.clinicId.length < 1 || typeof payload.avalPaginaPublica !== "boolean") {
    return { error: "No se pudo actualizar el consentimiento." };
  }
  const token = await getSessionToken();
  if (!token) return { error: "Iniciá sesión para actualizar el consentimiento." };
  const result = await apiActualizarAvalPaginaPublica(token, payload);
  if (!result.ok) return { error: result.error };
  revalidatePath("/perfil");
  revalidatePath("/personalizar-pagina");
  return { clinicId: result.data.clinicId, avalPaginaPublica: result.data.avalPaginaPublica };
}
