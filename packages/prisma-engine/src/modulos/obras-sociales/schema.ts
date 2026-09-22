import { z } from "zod";
import { campoEfectos, campoNombrePropio, camposDeSeccion } from "../../schema-base";
import { SLOTS_COBERTURAS } from "./variantes";
import { IDS_COBERTURAS } from "./catalogo";

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoEfectos(SLOTS_COBERTURAS),
  coberturas: z.array(z.enum(IDS_COBERTURAS)).max(IDS_COBERTURAS.length).optional(),
  consultaPorOtras: z.boolean().optional(),
});
