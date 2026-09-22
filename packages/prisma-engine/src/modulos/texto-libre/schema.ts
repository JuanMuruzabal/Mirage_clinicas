import { z } from "zod";
import { campoNombrePropio } from "../../schema-base";
import { MAX_LARGO_TEXTO_LIBRE, MAX_LARGO_TITULO_TEXTO } from "../../constantes";

export const schema = z.object({
  ...campoNombrePropio,
  titulo: z.string().max(MAX_LARGO_TITULO_TEXTO).optional(),
  texto: z.string().max(MAX_LARGO_TEXTO_LIBRE).optional(),
});
