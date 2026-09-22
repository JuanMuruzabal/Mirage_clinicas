import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, campoEfectos } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { SLOTS_CONTACTO } from "../../efectos/slots";

// "contacto" tampoco tiene config propia (edita dirección/mapa/redes, campos
// de la PÁGINA — ver editor.tsx).
export const schema = z.object({ ...campoNombrePropio, ...camposDeSeccion, ...campoVariante(VARIANTES), ...campoEfectos(SLOTS_CONTACTO) });
