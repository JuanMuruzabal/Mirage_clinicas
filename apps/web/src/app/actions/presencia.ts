"use server";

import { apiPresencia } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import type { Presencia } from "@dental-mirage/shared-types";

// presenciaAction — el latido del panel abierto (Fase 3.2.5).
//
// Va por Server Action y no por un fetch del navegador a la API porque
// TODO el tráfico hacia apps/api pasa por el BFF (CLAUDE.md): el token de
// sesión vive en una cookie httpOnly y el navegador no puede leerlo.
//
// Pedir la presencia ES avisar que uno sigue ahí — el backend refresca el
// último latido de quien pregunta antes de responder (presencia.go), así
// que no hay una segunda llamada de "sigo acá".
//
// Devuelve null en vez de tirar: esto corre en un intervalo, y un error
// de red pasajero no puede romper el panel. La pantalla se queda con la
// última foto que tenía, que envejece sola.
export async function presenciaAction(): Promise<Presencia | null> {
  const token = await getSessionToken();
  if (!token) return null;
  const resultado = await apiPresencia(token);
  return resultado.ok ? resultado.data : null;
}
