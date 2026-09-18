// Aplicación visual de un tema a la plantilla pública (Fase 4.5). Los
// catálogos (paletas.ts, tipografias.ts) solo describen; esto los traduce a
// lo que la plantilla necesita: un className (las variables de next/font) y
// un style (custom properties de color + la tipografía).
//
// Sin tema elegido (`tema === ""`, toda página anterior a la Fase 4) NO se
// cambia nada: la plantilla conserva su piel celeste de siempre, no se
// adopta "calido" en silencio.
import type { CSSProperties } from "react";
import { derivarColorDeVariante, paletaPorId, variantePorId } from "./paletas";
import { TIPOGRAFIAS_PAGINA_PUBLICA, tipografiaPorId } from "./tipografias";
import { TIPOGRAFIAS_POR_TEMA } from "./index";

export interface EstiloDeTema {
  /** false = sin tema: la plantilla usa su aspecto original. */
  activo: boolean;
  className: string;
  style: CSSProperties;
}

const SIN_TEMA: EstiloDeTema = { activo: false, className: "", style: {} };

// Custom properties de la plantilla (prefijo --pp-, "página pública"): la
// plantilla las lee con un fallback al aspecto original, así que sin tema
// simplemente no están definidas.
export function estiloDeTema(tema: string, variante: string, tipografia: string): EstiloDeTema {
  const paleta = paletaPorId(tema);
  if (!paleta) return SIN_TEMA;

  // Una variante o tipografía que no corresponde al tema (dato viejo, o un
  // catálogo que cambió) cae a la primera del tema en vez de romper la
  // página: lo que llega de la base es un string, no un tipo.
  const v = variantePorId(paleta, variante) ?? paleta.variantes[0];
  const colores = derivarColorDeVariante(paleta, v);
  const ofrecidas = TIPOGRAFIAS_POR_TEMA[paleta.id] ?? [TIPOGRAFIAS_PAGINA_PUBLICA[0].id];
  const tipo = tipografiaPorId(tipografia) ?? tipografiaPorId(ofrecidas[0]) ?? TIPOGRAFIAS_PAGINA_PUBLICA[0];

  return {
    activo: true,
    className: tipo.claseVariables,
    style: {
      "--pp-fondo": paleta.fondoBase,
      "--pp-acento": colores.acento,
      "--pp-acento-suave": colores.fondo,
      "--pp-acento-texto": colores.texto,
      // Pisar --font-display/--font-body en ESTE subárbol es lo que hace
      // que los títulos (que ya usan var(--font-display)) tomen la
      // tipografía del tema sin tocar cada uno.
      "--font-display": `var(${tipo.displayVar}), Georgia, serif`,
      "--font-body": `var(${tipo.bodyVar}), -apple-system, "Segoe UI", sans-serif`,
      fontFamily: "var(--font-body)",
    } as CSSProperties,
  };
}
