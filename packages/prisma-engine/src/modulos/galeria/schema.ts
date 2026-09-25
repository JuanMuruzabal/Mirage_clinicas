import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, campoEfectos, urlDeFotoSchema, altDeFotoSchema } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { SLOTS_GALERIA } from "../../efectos/slots";
import { TOPE_FOTOS_GALERIA } from "../../constantes";

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  ...campoEfectos(SLOTS_GALERIA),
  fotoUrls: z.array(urlDeFotoSchema).max(TOPE_FOTOS_GALERIA).optional(),
  // Paralela a fotoUrls, posición por posición (PP-4, H13): así la forma de
  // fotoUrls no cambia y una config vieja sigue valiendo tal cual. Puede ser
  // más corta que fotoUrls — lo que falta es "sin descripción".
  fotoAlts: z.array(altDeFotoSchema).max(TOPE_FOTOS_GALERIA).optional(),
});
