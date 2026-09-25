import { z } from "zod";
import { campoNombrePropio, camposDeSeccion, campoEfectos, urlDeFotoSchema, altDeFotoSchema } from "../../schema-base";
import { SLOTS_FOTO } from "../../efectos/slots";

// `subtipo` es obligatorio (mismo criterio que subtiposFotoValidos en
// pagina_publica.go: un config sin subtipo, o con uno inválido, se rechaza
// — el editor siempre manda uno, ver configInicial en meta.ts).
export const schema = z.object({
  ...campoNombrePropio,
  ...camposDeSeccion,
  ...campoEfectos(SLOTS_FOTO),
  fotoUrl: urlDeFotoSchema.optional(),
  fotoAlt: altDeFotoSchema.optional(),
  subtipo: z.enum(["retrato", "banner", "franja"]),
});
