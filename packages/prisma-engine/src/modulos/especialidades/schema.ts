import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante, campoEfectos } from "../../schema-base";
import { VARIANTES } from "./variantes";
import { SLOTS_TARJETA } from "../../efectos/slots";

// "especialidades" se arma sola con las de los profesionales: no tiene config propia.
export const schema = z.object({ ...campoNombrePropio, ...camposDeSeccion, ...campoVariante(VARIANTES), ...campoEfectos(SLOTS_TARJETA) });
