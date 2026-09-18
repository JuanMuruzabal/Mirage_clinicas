"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaginaPublica } from "@dental-mirage/shared-types";
import {
  apiActualizarPaginaPublica,
  apiDeployarPaginaPublica,
  apiOcultarPaginaPublica,
  apiSubirFotoPaginaPublica,
  type ActualizarPaginaPublicaPayload,
} from "@/lib/api";
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

// actualizarPaginaPublicaAction (Fase 4.2) — reemplazo del contenido
// completo (bio, tema, módulos, fotos), calcando el retorno/redirect de
// las dos de arriba. Sin UI todavía (la Fase 4.4 conecta pagina-editor.tsx
// acá) — revalida /buscar también, porque una clínica ya deployada puede
// cambiar lo que el buscador muestra (especialidades, nombre) apenas se
// guarda.
export async function actualizarPaginaPublicaAction(
  payload: ActualizarPaginaPublicaPayload,
): Promise<PaginaPublicaActionResult | { pagina: PaginaPublica }> {
  const token = await getSessionToken();
  if (!token) {
    redirect("/ingresar");
  }
  const result = await apiActualizarPaginaPublica(token, payload);
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/personalizar-pagina");
  if (result.data.deployadaEn) {
    revalidatePath("/buscar");
  }
  return { pagina: result.data };
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
