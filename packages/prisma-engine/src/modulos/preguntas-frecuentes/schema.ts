import { z } from "zod";
import { campoEfectos, campoNombrePropio, camposDeSeccion } from "../../schema-base";
import { SLOTS_PREGUNTAS } from "./variantes";
import { MAX_LARGO_PREGUNTA, MAX_LARGO_RESPUESTA, MAX_PREGUNTAS_FRECUENTES } from "./limites";

const preguntaSchema = z.object({
  pregunta: z.string().max(MAX_LARGO_PREGUNTA),
  respuesta: z.string().max(MAX_LARGO_RESPUESTA),
}).strict();

export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoEfectos(SLOTS_PREGUNTAS),
  preguntas: z.array(preguntaSchema).max(MAX_PREGUNTAS_FRECUENTES).optional(),
});
