import { z } from "zod";
import { campoNombrePropio } from "../../schema-base";

// "especialidades" se arma sola con las de los profesionales: no tiene config propia.
export const schema = z.object({ ...campoNombrePropio });
