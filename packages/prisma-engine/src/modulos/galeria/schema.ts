import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, campoEfectos, urlDeFotoSchema } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { SLOTS_GALERIA } from "../../efectos/slots";
import { TOPE_FOTOS_GALERIA } from "../../constantes";

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  ...campoEfectos(SLOTS_GALERIA),
  fotoUrls: z.array(urlDeFotoSchema).max(TOPE_FOTOS_GALERIA).optional(),
});
