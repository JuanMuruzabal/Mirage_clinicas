import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, campoEfectos } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { SLOTS_ESTADISTICAS } from "../../efectos/slots";

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  ...campoEfectos(SLOTS_ESTADISTICAS),
  mostrar: z.array(z.enum(["pacientes_atendidos", "turnos_realizados"])).optional(),
});
