import { describe, expect, it } from "vitest";
import { PALETAS_PAGINA_PUBLICA, TIPOGRAFIAS_PAGINA_PUBLICA, TIPOGRAFIAS_POR_TEMA } from "./index";
import { estiloDeTema } from "./aplicar";

// El catálogo prometió "verificado en contraste AA" (fase4-personalizar-
// pagina.md) pero derivaba los colores con color-mix() sin que nadie
// midiera el resultado. Este test lo mide: reproduce la mezcla en sRGB y
// exige 4.5:1 (AA, texto normal) para el texto de acento sobre el fondo
// suave que lo acompaña en chips y links, y para el texto del cuerpo
// (grafito) sobre el fondo de la página.

function aRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// color-mix(in srgb, A p%, B) = p*A + (1-p)*B, canal por canal.
function mezclar(a: [number, number, number], b: [number, number, number], porcentajeA: number): [number, number, number] {
  const p = porcentajeA / 100;
  return [0, 1, 2].map((i) => a[i] * p + b[i] * (1 - p)) as [number, number, number];
}
function luminancia([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const GRAFITO = aRgb("#35312b"); // --color-grafito (globals.css)
const NEGRO: [number, number, number] = [0, 0, 0];

describe("catálogo de temas", () => {
  it("son 5 temas de 3 variantes, y cada uno ofrece 2 tipografías que existen", () => {
    expect(PALETAS_PAGINA_PUBLICA).toHaveLength(5);
    const ids = new Set(TIPOGRAFIAS_PAGINA_PUBLICA.map((t) => t.id));
    for (const p of PALETAS_PAGINA_PUBLICA) {
      expect(p.variantes).toHaveLength(3);
      expect(TIPOGRAFIAS_POR_TEMA[p.id]).toHaveLength(2);
      for (const t of TIPOGRAFIAS_POR_TEMA[p.id]) expect(ids.has(t)).toBe(true);
    }
  });

  for (const paleta of PALETAS_PAGINA_PUBLICA) {
    for (const v of paleta.variantes) {
      it(`${v.id} (${v.nombre}): el texto de acento sobre su fondo suave cumple AA (4.5:1)`, () => {
        const acento = aRgb(v.hex);
        const fondoSuave = mezclar(acento, aRgb(paleta.fondoBase), 25);
        const texto = mezclar(acento, NEGRO, 65);
        expect(contraste(texto, fondoSuave)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${v.id} (${v.nombre}): el texto de acento sobre el fondo de la página cumple AA (4.5:1)`, () => {
        const texto = mezclar(aRgb(v.hex), NEGRO, 65);
        expect(contraste(texto, aRgb(paleta.fondoBase))).toBeGreaterThanOrEqual(4.5);
      });
    }

    it(`${paleta.id}: el cuerpo (grafito) sobre el fondo de la página cumple AA`, () => {
      expect(contraste(GRAFITO, aRgb(paleta.fondoBase))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("estiloDeTema", () => {
  it("sin tema (o desconocido) no toca nada", () => {
    expect(estiloDeTema("", "", "")).toEqual({ activo: false, className: "", style: {} });
    expect(estiloDeTema("inventado", "x", "y").activo).toBe(false);
  });

  it("con tema define fondo, acento y tipografía", () => {
    const e = estiloDeTema("clasico", "clasico-2", "serif-clasica");
    expect(e.activo).toBe(true);
    const style = e.style as Record<string, string>;
    expect(style["--pp-fondo"]).toBe("#f4f1e8");
    expect(style["--pp-acento"]).toBe("#a8823c");
    expect(style["--pp-acento-suave"]).toContain("color-mix");
    expect(style["--font-display"]).toContain("--font-tema-serif-clasica-display");
    expect(e.className).toContain("--mock-fraunces");
  });

  it("sin tipografía elegida usa la primera que ofrece el tema", () => {
    const style = estiloDeTema("natural", "natural-1", "").style as Record<string, string>;
    expect(style["--font-display"]).toContain("--font-tema-redondeada-calida-display");
  });

  it("la tipografía 'condensada' reusa las fuentes globales, sin clase propia", () => {
    const e = estiloDeTema("calido", "calido-1", "condensada-institucional");
    expect(e.className).toBe("");
    expect((e.style as Record<string, string>)["--font-display"]).toContain("--font-big-shoulders");
  });
});
