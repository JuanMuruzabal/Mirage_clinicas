"use server";

import {
  apiEquipo,
  apiMe,
  apiMisClinicas,
  apiVistaActual,
  apiElegirVista,
} from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import type {
  ClinicaDelUsuario,
  Equipo,
  VistaActual,
} from "@dental-mirage/shared-types";
import type { OpcionProfesional } from "@/components/panel/zona-profesional";

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
  const [meResult, clinicasResult, equipoResult, vistaResult] =
    await Promise.all([
      apiMe(token),
      apiMisClinicas(token),
      apiEquipo(token),
      apiVistaActual(token),
    ]);

  const clinicaDeLaSesion = meResult.ok ? meResult.data.clinica : null;
  const clinicas = (clinicasResult.ok ? clinicasResult.data.clinicas : []).map(
    (clinica) => ({
      ...clinica,
      // El tilde de la lista y el nombre del botón, contra la misma fuente.
      activa: clinicaDeLaSesion
        ? clinica.id === clinicaDeLaSesion.id
        : clinica.activa,
    }),
  );

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

/**
 * OpcionesDeAgenda — a qué agendas puede cargarle algo esta sesión (QA de
 * la Fase 3.2.6).
 *
 * Es la lista que llena el carrusel DENTRO de los formularios del panel:
 * "+ Agregar turno", "Reservar horario", "Compartir link" y la
 * configuración del calendario. No es lo mismo que el selector de VISTA:
 * ahí se elige qué se mira, acá a quién se le carga.
 *
 * Y por eso vale para todos, no solo para recepción. Un profesional
 * tiene una sola agenda —la suya— y el carrusel se lo dice con su propio
 * nombre en vez del "Con vos" genérico de antes; recepción tiene N, y
 * elige. El backend impone lo mismo por su lado: quien no es recepción
 * solo puede cargar en la propia (ver `puedeGenerarEnlacePara`).
 */
export interface OpcionesDeAgenda {
  profesionales: OpcionProfesional[];
  /** Mi propia agenda, si atiendo pacientes. Es el default de los
   *  formularios: lo más común es cargarse algo a uno mismo. */
  miUserId: string | null;
  /** Si puedo elegir la agenda de otro. Solo recepción. */
  puedeElegirOtros: boolean;
  /** En qué agenda está parada la SESIÓN, o null en la vista general.
   *  Lo necesita el carrusel de "Configuración de calendario", que sí
   *  mueve el foco — ver `SelectorDeVistaDeRecepcion`. */
  focoActual: string | null;
}

export async function opcionesDeAgendaAction(): Promise<OpcionesDeAgenda> {
  const vacio: OpcionesDeAgenda = {
    profesionales: [],
    miUserId: null,
    puedeElegirOtros: false,
    focoActual: null,
  };
  const token = await getSessionToken();
  if (!token) return vacio;

  const [meResult, equipoResult, vistaResult] = await Promise.all([
    apiMe(token),
    apiEquipo(token),
    apiVistaActual(token),
  ]);
  if (!equipoResult.ok) return vacio;

  const roles = meResult.ok ? (meResult.data.clinica?.roles ?? []) : [];
  const puedeElegirOtros = roles.includes("recepcion");

  const queAtienden = equipoResult.data.miembros.filter((m) =>
    m.roles.includes("profesional"),
  );
  const mio = queAtienden.find((m) => m.esVos) ?? null;

  // Sin permiso para elegir otras, la lista es la propia agenda y nada
  // más: esconder el resto no es lo que protege el aislamiento —el
  // backend lo hace—, pero ofrecer lo que va a ser rechazado es ofrecer
  // un error.
  const visibles = puedeElegirOtros
    ? queAtienden
    : queAtienden.filter((m) => m.esVos);

  return {
    profesionales: visibles.map((m) => ({
      userId: m.userId,
      nombre: m.nombre,
      detalle: m.especialidad || "Profesional de la clínica",
    })),
    miUserId: mio?.userId ?? null,
    puedeElegirOtros,
    focoActual: vistaResult.ok
      ? (vistaResult.data.profesional?.userId ?? null)
      : null,
  };
}

// elegirVistaAction — pararse en la vista de un profesional, o volver a
// la general mandando el id vacío (Fase 3.2.6).
//
// El permiso lo decide el backend (403 si no es recepción): esconder el
// selector nunca fue cerrar la puerta, misma lección que
// /personalizar-pagina en la 3.2.4.
export async function elegirVistaAction(
  userId: string,
): Promise<{ error?: string }> {
  const token = await getSessionToken();
  if (!token) return { error: "sesión vencida" };
  const result = await apiElegirVista(token, userId);
  if (!result.ok) return { error: result.error };
  return {};
}
