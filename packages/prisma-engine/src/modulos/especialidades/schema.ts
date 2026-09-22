import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoVariante } from "../../schema-base";
import { VARIANTES } from "./variantes";

// "especialidades" se arma sola con las de los profesionales: no tiene config propia.
export const schema = z.object({ ...campoNombrePropio, ...camposDeSeccion, ...campoVariante(VARIANTES) });
