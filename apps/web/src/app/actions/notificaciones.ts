"use server";

import type { BandejaDeNotificaciones } from "@dental-mirage/shared-types";
import {
  apiAbrirNotificacion,
  apiBandejaDeNotificaciones,
  apiBorrarSuscripcionPush,
  apiConfiguracionPush,
  apiContadorDeNotificaciones,
  apiGuardarSuscripcionPush,
  apiLeerNotificacion,
  type SuscripcionPush,
} from "@/lib/api";
import { destinoDeApertura } from "@/lib/notificaciones";
import { getSessionToken } from "@/lib/session";

// Notificaciones por cuenta (TR-179). Las usa la campana del header, que
// vive en el layout raíz y se dibuja en cualquier pantalla: sin sesión no
// redirigen a /ingresar — devuelven "nada", y la campana no se muestra.

/** El número de la campana. 0 ante cualquier error: un número inventado
 *  sería peor que ninguno. */
export async function contarNotificacionesNuevasAction(): Promise<number> {
  const token = await getSessionToken();
  if (!token) return 0;
  const res = await apiContadorDeNotificaciones(token);
  return res.ok ? res.data.nuevas : 0;
}

export async function bandejaDeNotificacionesAction(
  estado: "nuevas" | "leidas",
): Promise<BandejaDeNotificaciones | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const res = await apiBandejaDeNotificaciones(token, estado);
  return res.ok ? res.data : null;
}

export async function leerNotificacionAction(id: string): Promise<boolean> {
  const token = await getSessionToken();
  if (!token) return false;
  return (await apiLeerNotificacion(token, id)).ok;
}

export interface ResultadoDeAbrir {
  /** Adónde ir; null si no hay adónde (la bienvenida). */
  destino: string | null;
  /** La sesión quedó en otra clínica: hay que recargar la página entera,
   *  porque el header y el selector de clínica muestran la anterior. */
  recargar: boolean;
}

export async function abrirNotificacionAction(id: string): Promise<ResultadoDeAbrir | { error: string }> {
  const token = await getSessionToken();
  if (!token) return { error: "Tu sesión venció. Volvé a ingresar." };
  const res = await apiAbrirNotificacion(token, id);
  if (!res.ok) return { error: res.error };
  return { destino: destinoDeApertura(res.data), recargar: res.data.cambioDeClinica };
}

/** La clave pública para suscribir este navegador. Vacía: los avisos al
 *  celular no están configurados y no se ofrecen. */
export async function clavePublicaPushAction(): Promise<string> {
  const token = await getSessionToken();
  if (!token) return "";
  const res = await apiConfiguracionPush(token);
  return res.ok ? res.data.clavePublica : "";
}

export async function guardarSuscripcionPushAction(suscripcion: SuscripcionPush): Promise<boolean> {
  const token = await getSessionToken();
  if (!token) return false;
  return (await apiGuardarSuscripcionPush(token, suscripcion)).ok;
}

export async function borrarSuscripcionPushAction(endpoint: string): Promise<boolean> {
  const token = await getSessionToken();
  if (!token) return false;
  return (await apiBorrarSuscripcionPush(token, endpoint)).ok;
}
