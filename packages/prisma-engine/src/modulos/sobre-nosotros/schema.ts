import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, campoEfectos, urlDeFotoSchema } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { SLOTS_TEXTO, SLOTS_IMAGEN } from "../../efectos/slots";

// "sobre_nosotros" no tiene texto propio (edita `bio`, un campo de la
// PÁGINA — ver editor.tsx): su config es el nombre propio, las opciones de
// sección y, desde PE-3, la foto de la variante "con-foto".
export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  ...campoEfectos([...SLOTS_TEXTO, ...SLOTS_IMAGEN]),
  fotoUrl: urlDeFotoSchema.optional(),
});
