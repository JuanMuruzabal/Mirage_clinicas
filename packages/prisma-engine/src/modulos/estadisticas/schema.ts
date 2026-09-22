import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante } from "../../schema-base";
import { VARIANTES } from "./variantes";

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  mostrar: z.array(z.enum(["pacientes_atendidos", "turnos_realizados"])).optional(),
});
