import { z } from "zod";
import { campoNombrePropio, urlDeFotoSchema } from "../../schema-base";

// `subtipo` es obligatorio (mismo criterio que subtiposFotoValidos en
// pagina_publica.go: un config sin subtipo, o con uno inválido, se rechaza
// — el editor siempre manda uno, ver configInicial en meta.ts).
export const schema = z.object({
  ...campoNombrePropio,
  fotoUrl: urlDeFotoSchema.optional(),
  subtipo: z.enum(["retrato", "banner", "franja"]),
});
