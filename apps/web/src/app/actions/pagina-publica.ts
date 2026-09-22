"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ConflictoRevisionPagina, PaginaPublica, VersionPaginaPublica } from "@dental-mirage/shared-types";
import {
  apiActualizarPaginaPublica,
  apiGetPaginaPublica,
  apiObtenerHistorialPaginaPublica,
  apiOcultarPaginaPublica,
  apiPublicarPaginaPublica,
  apiRestaurarVersionPaginaPublica,
  apiSubirFotoPaginaPublica,
  type ActualizarPaginaPublicaPayload,
} from "@/lib/api";
import { getSessionToken } from "@/lib/session";

export interface PaginaPublicaActionResult {
  error: string;
}

// obtenerPaginaPublicaAction (PE-8) — recarga el estado real del servidor
// tras un conflicto de revisión (409): "Recargar" en el editor llama acá y
// descarta el borrador local, en vez de reintentar a ciegas.
export async function obtenerPaginaPublicaAction(): Promise<PaginaPublicaActionResult | { pagina: PaginaPublica }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiGetPaginaPublica(token);
  if (!result.ok) {
    return { error: result.error };
  }
  return { pagina: result.data };
}

// GuardarPaginaPublicaActionResult (PE-8) — Guardar y Restaurar comparten
// este resultado: además de éxito/error, un 409 trae quién y cuándo guardó
// antes (ver ConflictoRevisionPagina), para que el editor ofrezca
// "recargar" o "quedarte con tu copia" sin adivinar.
export type GuardarPaginaPublicaActionResult =
  | { kind: "ok"; pagina: PaginaPublica }
  | { kind: "conflicto"; conflicto: ConflictoRevisionPagina }
  | { kind: "error"; error: string };

// ocultarPaginaPublicaAction (T4.2, spec §5.2) — reversible en cualquier
// dirección, a diferencia de publicar.
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

// publicarPaginaPublicaAction (PE-8, reemplaza a deployarPaginaPublicaAction):
// copia el borrador a una versión nueva; también revalida /{slug} y /buscar
// — a partir de acá un visitante puede ver contenido nuevo, y la primera
// vez la clínica pasa a aparecer en el buscador público (T4.5).
export async function publicarPaginaPublicaAction(
  slug: string,
): Promise<PaginaPublicaActionResult | { pagina: PaginaPublica }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiPublicarPaginaPublica(token);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/personalizar-pagina");
  revalidatePath("/buscar");
  revalidatePath(`/${slug}`);
  return { pagina: result.data };
}

// actualizarPaginaPublicaAction (Fase 4.2, PE-8) — Guardar: persiste el
// borrador completo (bio, tema, módulos, fotos). Ya NO publica nada —
// GET /clinicas/{slug} sigue sirviendo la última versión publicada hasta
// el próximo Publicar (ver publicarPaginaPublicaAction) — así que acá no
// hace falta revalidar /buscar ni /{slug}.
export async function actualizarPaginaPublicaAction(
  payload: ActualizarPaginaPublicaPayload,
): Promise<GuardarPaginaPublicaActionResult> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiActualizarPaginaPublica(token, payload);
  if (result.kind === "error") {
    return { kind: "error", error: result.error };
  }
  if (result.kind === "conflicto") {
    return { kind: "conflicto", conflicto: result.conflicto };
  }
  revalidatePath("/personalizar-pagina");
  return { kind: "ok", pagina: result.data };
}

// historialPaginaPublicaAction (PE-8) — todas las versiones publicadas,
// más nueva primero.
export async function historialPaginaPublicaAction(): Promise<PaginaPublicaActionResult | { versiones: VersionPaginaPublica[] }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiObtenerHistorialPaginaPublica(token);
  if (!result.ok) {
    return { error: result.error };
  }
  return { versiones: result.data };
}

// restaurarVersionPaginaPublicaAction (PE-8) — copia el CONTENIDO de una
// versión al borrador; nunca publica directo (el admin sigue teniendo que
// apretar "Publicar" para que un visitante lo vea).
export async function restaurarVersionPaginaPublicaAction(
  numero: number,
  revision: number,
): Promise<GuardarPaginaPublicaActionResult> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiRestaurarVersionPaginaPublica(token, numero, revision);
  if (result.kind === "error") {
    return { kind: "error", error: result.error };
  }
  if (result.kind === "conflicto") {
    return { kind: "conflicto", conflicto: result.conflicto };
  }
  revalidatePath("/personalizar-pagina");
  return { kind: "ok", pagina: result.data };
}

// subirFotoPaginaPublicaAction (Fase 4.4) — sube UNA foto y devuelve su URL;
// no guarda nada en la página: el editor la guarda recién con "Guardar
// cambios", junto con el resto. Un archivo subido y nunca guardado queda
// huérfano en el storage (costo aceptado: la alternativa, subir recién al
// guardar, obligaría a mantener los `File` en memoria del navegador).
export async function subirFotoPaginaPublicaAction(formData: FormData): Promise<PaginaPublicaActionResult | { url: string }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    return { error: "Elegí una imagen para subir." };
  }
  const result = await apiSubirFotoPaginaPublica(token, foto);
  if (!result.ok) {
    // 501: el backend no tiene storage configurado (producción, hasta la
    // Fase 4.6). Es un estado esperable, no un fallo — se dice como tal.
    if (result.status === 501) {
      return { error: "La subida de fotos todavía no está disponible en este entorno." };
    }
    return { error: result.error };
  }
  return { url: result.data.url };
}
