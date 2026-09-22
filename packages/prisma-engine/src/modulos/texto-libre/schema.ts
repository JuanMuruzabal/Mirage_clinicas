import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, urlDeFotoSchema } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { MAX_LARGO_TEXTO_LIBRE, MAX_LARGO_TITULO_TEXTO } from "../../constantes";

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  // fotoUrl — solo la usa la variante "con-foto" (PE-3).
  fotoUrl: urlDeFotoSchema.optional(),
  titulo: z.string().max(MAX_LARGO_TITULO_TEXTO).optional(),
  texto: z.string().max(MAX_LARGO_TEXTO_LIBRE).optional(),
});
