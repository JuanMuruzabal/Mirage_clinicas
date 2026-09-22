import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, urlDeFotoSchema } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { TOPE_FOTOS_GALERIA } from "../../constantes";

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  fotoUrls: z.array(urlDeFotoSchema).max(TOPE_FOTOS_GALERIA).optional(),
});
