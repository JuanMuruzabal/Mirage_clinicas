// Consentimiento informado de tratamiento de conducto, versión 2 (Fase 5.2).
//
// Lo mismo que la versión 1, menos los datos de quien suscribe —nombre,
// fecha de nacimiento, DNI y domicilio—: los completa a mano, en la hoja
// impresa, la persona que firma (pedido del cliente, 2026-09-29). Es una
// versión nueva y no un cambio de la 1 porque el texto que se congela
// cambia (TR-187): los documentos hechos con la 1 la siguen usando.
//
// Se arma a partir de la 1 para que el resto —el texto legal, los demás
// campos, la lámina— sea idéntico por construcción.
import type { Bloque, Plantilla } from "../esquema";
import { consentimientoTratamientoConducto as v1 } from "./consentimiento-tratamiento-conducto";

const A_MANO = new Set(["suscribe_nombre", "suscribe_fecha_nacimiento", "suscribe_dni", "suscribe_domicilio"]);
const BLANCO = "__________";

function sinMarcasAMano(bloque: Bloque): Bloque {
  if (bloque.t !== "parrafo") return bloque;
  return { ...bloque, texto: bloque.texto.replace(/\{\{([a-z_]+)\}\}/g, (marca, id: string) => (A_MANO.has(id) ? BLANCO : marca)) };
}

export const consentimientoTratamientoConductoV2: Plantilla = {
  ...v1,
  version: 2,
  secciones: v1.secciones.map((s) =>
    s.id === "firmante" ? { id: "lugar", titulo: "Lugar y fecha", campos: s.campos.filter((c) => !A_MANO.has(c.id)) } : s,
  ),
  cuerpo: v1.cuerpo.map(sinMarcasAMano),
  lamina: v1.lamina && { ...v1.lamina, zonas: v1.lamina.zonas.filter((z) => !A_MANO.has(z.id)) },
};
