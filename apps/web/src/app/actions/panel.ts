"use server";

import type { PanelNotificacionesResponse } from "@dental-mirage/shared-types";
import { apiPanelNotificaciones } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

// panelNotificacionesAction — TR-108 (docs/ArquitecturaPeticionesTurno.md):
// fuente de datos de NotificacionesConflictoGlobal, montado en todo el
// panel. Mismo criterio que turnosPendientesAsistenciaAction: nunca
// redirige a /ingresar sin sesión, "nada que avisar" es la respuesta
// segura desde un componente que sondea en segundo plano.
export async function panelNotificacionesAction(): Promise<PanelNotificacionesResponse> {
  const token = await getSessionToken();
  if (!token) {
    return { conflictosPacientes: 0, conflictosCalendario: 0 };
  }
  const result = await apiPanelNotificaciones(token);
  return result.ok ? result.data : { conflictosPacientes: 0, conflictosCalendario: 0 };
}
