import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, campoEfectos, urlDeFotoSchema } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { SLOTS_TEXTO, SLOTS_IMAGEN } from "../../efectos/slots";
import { MAX_LARGO_TEXTO_LIBRE, MAX_LARGO_TITULO_TEXTO } from "../../constantes";

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  ...campoEfectos([...SLOTS_TEXTO, ...SLOTS_IMAGEN]),
  // fotoUrl — solo la usa la variante "con-foto" (PE-3).
  fotoUrl: urlDeFotoSchema.optional(),
  titulo: z.string().max(MAX_LARGO_TITULO_TEXTO).optional(),
  texto: z.string().max(MAX_LARGO_TEXTO_LIBRE).optional(),
});
