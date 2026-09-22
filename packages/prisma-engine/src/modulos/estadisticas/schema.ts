import { z } from "zod";
import { campoNombrePropio } from "../../schema-base";

export const schema = z.object({
  ...campoNombrePropio,
  mostrar: z.array(z.enum(["pacientes_atendidos", "turnos_realizados"])).optional(),
});
