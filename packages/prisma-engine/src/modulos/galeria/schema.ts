import { z } from "zod";
import { campoNombrePropio, urlDeFotoSchema } from "../../schema-base";
import { TOPE_FOTOS_GALERIA } from "../../constantes";

export const schema = z.object({
  ...campoNombrePropio,
  fotoUrls: z.array(urlDeFotoSchema).max(TOPE_FOTOS_GALERIA).optional(),
});
