import type { VarianteModulo } from "./tipos";

// Variantes de la PORTADA (PE-3). La portada no es un módulo (es estructural,
// la dibuja la plantilla), así que su variante vive en los tokens de la
// página (`tema_tokens.portada`, ver tokens.ts) y no en una config de módulo.
// El orden y los ids son los de OPCIONES_TOKENS.portada.
export const VARIANTES_PORTADA: VarianteModulo[] = [
  { id: "centrada", nombre: "Centrada", bloques: [[10, 4, 80, 30, "foto"], [30, 40, 40, 7, "titulo"], [38, 51, 24, 5, "acento"]] },
  { id: "dividida", nombre: "Dividida", bloques: [[4, 6, 46, 48, "foto"], [56, 18, 36, 7, "titulo"], [56, 30, 28, 4, "texto"], [56, 40, 22, 6, "acento"]] },
  { id: "fondo", nombre: "Foto de fondo", bloques: [[0, 0, 100, 60, "foto"], [25, 26, 50, 8, "titulo"], [38, 40, 24, 6, "acento"]] },
  { id: "minima", nombre: "Mínima", bloques: [[25, 20, 50, 8, "titulo"], [35, 32, 30, 4, "texto"], [40, 42, 20, 6, "acento"]] },
];
