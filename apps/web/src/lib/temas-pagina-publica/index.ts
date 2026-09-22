// Catálogo combinado de temas de la página pública (Fase 4.3) — un tema
// es una Paleta (paletas.ts) + qué 2 Tipografías (tipografias.ts) ofrece
// para elegir dentro de él. Los IDs válidos los valida el backend contra
// packages/prisma-engine/catalogo/temas.json (PE-1; la base también, con
// CHECKs que se arman desde ese mismo archivo desde PE-2) — si se agrega o
// saca un tema acá, actualizar ese JSON en el mismo cambio y correr `pnpm
// engine:generar`. temas.test.ts falla si los dos no coinciden.
export { MEZCLA, PALETAS_PAGINA_PUBLICA, derivarColorDeVariante, paletaPorId, variantePorId } from "./paletas";
export type { Paleta, VariantePaleta, TemaColorDerivado } from "./paletas";
export { TIPOGRAFIAS_PAGINA_PUBLICA, tipografiaPorId } from "./tipografias";
export type { Tipografia } from "./tipografias";

import { PALETAS_PAGINA_PUBLICA } from "./paletas";

// Qué 2 tipografías del catálogo compartido ofrece cada tema — reusadas
// entre temas a propósito (ver tipografias.ts), no exclusivas.
export const TIPOGRAFIAS_POR_TEMA: Record<string, [string, string]> = {
  calido: ["condensada-institucional", "editorial-suave"],
  clinico: ["condensada-institucional", "geometrica-moderna"],
  moderno: ["geometrica-moderna", "condensada-institucional"],
  natural: ["redondeada-calida", "editorial-suave"],
  clasico: ["serif-clasica", "editorial-suave"],
  editorial: ["editorial-suave", "serif-clasica"],
  oscuro: ["geometrica-moderna", "editorial-suave"],
};

export function idsDeTemasValidos(): string[] {
  return PALETAS_PAGINA_PUBLICA.map((p) => p.id);
}
