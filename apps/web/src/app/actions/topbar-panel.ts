"use server";

import { apiEquipo, apiMe, apiMisClinicas, apiVistaActual, apiElegirVista } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import type { ClinicaDelUsuario, Equipo, VistaActual } from "@dental-mirage/shared-types";

export interface DatosDelTopbar {
  clinicas: ClinicaDelUsuario[];
  /** La clínica donde la sesión está trabajando, según /me — que resuelve
   *  el fallback de "la más antigua". NO se deriva del flag `activa` de
   *  la lista: ese vale solo cuando alguien eligió una a mano. */
  nombreClinicaActual: string | null;
  equipo: Equipo | null;
  /** Fase 3.2.6 — en qué vista de profesional está parada la sesión.
   *  `null` para quien no es recepción (no tiene vistas ajenas) y para
   *  recepción parada en la vista general de la clínica. */
  vista: VistaActual | null;
  /** Si esta sesión puede cambiar de vista. Lo decide el backend por el
   *  rol; acá solo decide si el selector se dibuja. */
  puedeCambiarDeVista: boolean;
}

// datosDelTopbarAction — lo que el topbar de /panel necesita: en qué
// clínica está parada la sesión, cuáles más tiene, y quién trabaja acá.
//
// POR QUÉ UNA SERVER ACTION Y NO EL SERVER COMPONENT DEL HEADER
// (reescrito el 2026-09-14, después de que el selector no apareciera).
//
// El header vive en el layout RAÍZ, y un layout no se vuelve a renderizar
// en una navegación del cliente. Pidiendo los datos ahí, quien entraba a
// /clinicas y navegaba a /panel se quedaba con el render de /clinicas —
// donde el topbar no pide nada— y no veía ni el selector ni los
// colaboradores. Solo aparecían recargando la página parado en /panel.
//
// Desde el cliente, en cambio, `usePathname` es reactivo: entrar y salir
// del panel se nota. Y sigue sin romperse el patrón BFF — el navegador
// llama a esta acción, no a la API.
export async function datosDelTopbarAction(): Promise<DatosDelTopbar | null> {
  const token = await getSessionToken();
  if (!token) return null;

  // En paralelo: son independientes y encadenarlas sumaría dos vueltas
  // completas a la API al pintado del panel.
  const [meResult, clinicasResult, equipoResult, vistaResult] = await Promise.all([
    apiMe(token),
    apiMisClinicas(token),
    apiEquipo(token),
    apiVistaActual(token),
  ]);

  const clinicaDeLaSesion = meResult.ok ? meResult.data.clinica : null;
  const clinicas = (clinicasResult.ok ? clinicasResult.data.clinicas : []).map((clinica) => ({
    ...clinica,
    // El tilde de la lista y el nombre del botón, contra la misma fuente.
    activa: clinicaDeLaSesion ? clinica.id === clinicaDeLaSesion.id : clinica.activa,
  }));

  // El rol manda: solo recepción tiene vistas ajenas que mirar. Para el
  // resto el selector no existe, y el backend además responde 403 — esto
  // es lo que se dibuja, no lo que se permite.
  const esRecepcion = clinicaDeLaSesion?.roles?.includes("recepcion") ?? false;

  return {
    clinicas,
    nombreClinicaActual: clinicaDeLaSesion?.nombre ?? null,
    equipo: equipoResult.ok ? equipoResult.data : null,
    vista: vistaResult.ok ? vistaResult.data : null,
    puedeCambiarDeVista: esRecepcion,
  };
}

// elegirVistaAction — pararse en la vista de un profesional, o volver a
// la general mandando el id vacío (Fase 3.2.6).
//
// El permiso lo decide el backend (403 si no es recepción): esconder el
// selector nunca fue cerrar la puerta, misma lección que
// /personalizar-pagina en la 3.2.4.
export async function elegirVistaAction(userId: string): Promise<{ error?: string }> {
  const token = await getSessionToken();
  if (!token) return { error: "sesión vencida" };
  const result = await apiElegirVista(token, userId);
  if (!result.ok) return { error: result.error };
  return {};
}
