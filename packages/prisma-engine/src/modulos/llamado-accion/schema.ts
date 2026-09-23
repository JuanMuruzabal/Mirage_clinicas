import { z } from "zod";
import { campoEfectos, campoNombrePropio, camposDeSeccion } from "../../schema-base";
import { SLOTS_LLAMADO } from "./variantes";

export const DESTINOS_LLAMADO = ["turno", "whatsapp", "telefono"] as const;

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoEfectos(SLOTS_LLAMADO),
  texto: z.string().max(500).optional(),
  etiquetaBoton: z.string().max(48).optional(),
  destino: z.enum(DESTINOS_LLAMADO).optional(),
});
