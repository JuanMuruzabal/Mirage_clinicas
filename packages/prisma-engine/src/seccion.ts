// Opciones comunes de SECCIÓN (PE-3) — los catálogos, sin zod: los importa
// el render/registro (que termina en el bundle del cliente), y el esquema
// (schema-base.ts) los reusa para validar.
export const MAX_LARGO_TITULO_PUBLICO = 80;
export const FONDOS_SECCION = ["normal", "acento", "contraste"] as const;
export const ALINEACIONES = ["centro", "izquierda"] as const;
export type FondoSeccion = (typeof FONDOS_SECCION)[number];
export type Alineacion = (typeof ALINEACIONES)[number];
