// VARIANTES (PE-3), sin zod: las importan el esquema, el meta y el render.
// La primera es la de antes de PE-3 — sin `variante` en la config, el módulo
// se dibuja así. Tienen que coincidir con `variantes` de meta.ts (lo verifica
// registro.test.ts).
export const VARIANTES = ["grilla", "mosaico", "carrusel"] as const;
