import { z } from "zod";
import { campoNombrePropio } from "../../schema-base";

// "contacto" tampoco tiene config propia (edita dirección/mapa/redes, campos
// de la PÁGINA — ver editor.tsx).
export const schema = z.object({ ...campoNombrePropio });
