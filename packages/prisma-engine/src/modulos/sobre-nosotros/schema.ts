import { z } from "zod";
import { campoNombrePropio } from "../../schema-base";

// "sobre_nosotros" no tiene config propia (edita `bio`, un campo de la
// PÁGINA — ver editor.tsx) — solo el nombre propio que comparte cualquier módulo.
export const schema = z.object({ ...campoNombrePropio });
