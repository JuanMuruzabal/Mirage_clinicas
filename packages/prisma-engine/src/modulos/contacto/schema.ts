import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante } from "../../schema-base";
import { VARIANTES } from "./variantes";

// "contacto" tampoco tiene config propia (edita dirección/mapa/redes, campos
// de la PÁGINA — ver editor.tsx).
export const schema = z.object({ ...campoNombrePropio, ...camposDeSeccion, ...campoVariante(VARIANTES) });
