import { z } from "zod";
import { campoEfectos, campoNombrePropio, camposDeSeccion, campoVariante } from "../../schema-base";
import { SLOTS_HORARIOS } from "./slots";
import { VARIANTES } from "./variantes";

// El horario del edificio se administra por un endpoint propio; esta config
// conserva únicamente las opciones de presentación del módulo.
export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  ...campoEfectos(SLOTS_HORARIOS),
});
