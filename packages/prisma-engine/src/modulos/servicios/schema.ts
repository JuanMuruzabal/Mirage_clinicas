import { z } from "zod";
import { campoEfectos, campoNombrePropio, camposDeSeccion, campoVariante } from "../../schema-base";
import { SLOTS_SERVICIOS } from "./slots";
import { VARIANTES } from "./variantes";
import { claveServicio } from "./clave";

const nombres = z.array(z.string().min(1).max(100)).max(50).refine(
  (valores) => new Set(valores.map(claveServicio)).size === valores.length,
  "No se pueden repetir servicios",
);

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoVariante(VARIANTES),
  ...campoEfectos(SLOTS_SERVICIOS),
  // Nombres normalizados, no IDs de TipoConsulta: cada profesional puede
  // tener su propia fila y duración para ofrecer el mismo servicio.
  nombres: nombres.optional(),
});
