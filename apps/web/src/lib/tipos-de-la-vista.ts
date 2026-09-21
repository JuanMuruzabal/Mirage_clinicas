import "server-only";
import type { TipoConsulta } from "@dental-mirage/shared-types";
import { apiListTiposConsulta } from "@/lib/api";
import { conPaletaPrecargada } from "@/lib/paleta-recepcion";

/**
 * Los tipos de consulta COMO LOS VE quien está mirando la pantalla.
 *
 * ## El color es de quien mira, no de quien cargó
 *
 * Es la regla de TR-145, y ya se había aplicado una vez: en la ficha de
 * un paciente, el turno de un colega se pinta con el color que el tipo
 * tiene en la paleta de quien abre la ficha, no con el del colega. Un
 * punto de color significa lo que decidió quien lo mira.
 *
 * Recepción no tenía paleta, así que esa regla se quedaba sin sujeto y
 * los colores de los profesionales se le mezclaban: el verde de uno puede
 * ser "Limpieza" mientras el de otro es "Urgencia". Ahora tiene la suya,
 * precargada (`lib/paleta-recepcion.ts`), y **vale en todas sus
 * pantallas** — también parada en la vista de un profesional.
 *
 * El pedido, textual: *"el color del tipo de consulta del profesional es
 * exclusivo de él... en todas las vistas el recepcionista ve con el color
 * de tipo de consulta que tiene"*.
 *
 * ## Lo que esto NO toca
 *
 * "Configuración de calendario" pide los tipos por su cuenta, del lado
 * del cliente, y ahí el color tiene que ser el REAL: recepción está
 * editando la configuración de ese profesional, y el color que ve es el
 * que va a guardar. Repintarlo ahí sería mentirle sobre lo que está
 * tocando.
 */
export async function tiposConsultaDeLaVista(
  token: string | undefined,
  roles: string[],
): Promise<TipoConsulta[]> {
  if (!token) return [];
  const resultado = await apiListTiposConsulta(token);
  const tipos = resultado.ok ? resultado.data : [];
  return roles.includes("recepcion") ? conPaletaPrecargada(tipos) : tipos;
}
