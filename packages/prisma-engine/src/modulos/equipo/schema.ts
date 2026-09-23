import { z } from "zod";
import { campoEfectos, campoNombrePropio, camposDeSeccion, campoVariante } from "../../schema-base";
import { SLOTS_EQUIPO } from "./slots";
import { VARIANTES } from "./variantes";

const idsDeUsuario = z.array(z.string().min(1).max(100)).max(100).refine((ids) => new Set(ids).size === ids.length, "No se pueden repetir profesionales");

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  ...campoEfectos(SLOTS_EQUIPO),
  modo: z.enum(["todos", "seleccion"]).optional(),
  userIds: idsDeUsuario.optional(),
  mostrarNombre: z.boolean().optional(),
  mostrarDescripcion: z.boolean().optional(),
});
