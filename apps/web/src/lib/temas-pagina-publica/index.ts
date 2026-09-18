// Catálogo combinado de temas de la página pública (Fase 4.3) — un tema
// es una Paleta (paletas.ts) + qué 2 Tipografías (tipografias.ts) ofrece
// para elegir dentro de él. Espejo de los IDs que valida el backend
// (apps/api/internal/http/temas_pagina_publica.go, temasValidos/
// tipografiasValidas) — si se agrega/saca un tema acá, hay que
// actualizar ese archivo Go en el mismo cambio o el PATCH del panel va a
// rechazar valores que el frontend ofrece (o va a aceptar valores que el
// frontend ya no muestra).
export { PALETAS_PAGINA_PUBLICA, derivarColorDeVariante, paletaPorId, variantePorId } from "./paletas";
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
};

export function idsDeTemasValidos(): string[] {
  return PALETAS_PAGINA_PUBLICA.map((p) => p.id);
}
