import { describe, expect, it } from "vitest";
import { MEZCLA, PALETAS_PAGINA_PUBLICA, TIPOGRAFIAS_PAGINA_PUBLICA, TIPOGRAFIAS_POR_TEMA } from "./index";
import { TOKENS_POR_DEFECTO } from "@dental-mirage/prisma-engine";
import { estiloDeTema } from "./aplicar";
import catalogoDeTemas from "../../../../../packages/prisma-engine/catalogo/temas.json";

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

const GRAFITO = "#35312b"; // --color-grafito (globals.css) — el texto por defecto
const MARFIL = "#fffdf9"; // --color-marfil — la superficie por defecto, y el texto sobre acento
const BASE = { negro: [0, 0, 0] as [number, number, number], blanco: [255, 255, 255] as [number, number, number] };

describe("catálogo de temas", () => {
  // PE-1: apps/api valida tema/variante/tipografía contra
  // packages/prisma-engine/catalogo/temas.json (generado hacia
  // apps/api/internal/prismaengine/, ver `pnpm engine:generar`), no contra
  // un mapa escrito a mano — pero ESTE archivo (el diseño real, con
  // next/font) no puede generarse desde ahí, porque next/font exige
  // llamadas estáticamente analizables. Este test es la protección contra
  // el desfase: si alguien agrega/saca un tema/variante/tipografía acá sin
  // tocar el JSON (o al revés), falla acá, no en un PATCH rechazado en
  // producción.
  it("los IDs coinciden con packages/prisma-engine/catalogo/temas.json", () => {
    const idsDelCatalogo = catalogoDeTemas as { temas: Record<string, string[]>; tipografias: string[] };
    const temasDeAca = Object.fromEntries(PALETAS_PAGINA_PUBLICA.map((p) => [p.id, p.variantes.map((v) => v.id)]));
    expect(temasDeAca).toEqual(idsDelCatalogo.temas);
    expect(TIPOGRAFIAS_PAGINA_PUBLICA.map((t) => t.id)).toEqual(idsDelCatalogo.tipografias);
  });

  it("son 7 temas de 3 variantes, y cada uno ofrece 2 tipografías que existen", () => {
    expect(PALETAS_PAGINA_PUBLICA).toHaveLength(7);
    const ids = new Set(TIPOGRAFIAS_PAGINA_PUBLICA.map((t) => t.id));
    for (const p of PALETAS_PAGINA_PUBLICA) {
      expect(p.variantes).toHaveLength(3);
      expect(TIPOGRAFIAS_POR_TEMA[p.id]).toHaveLength(2);
      for (const t of TIPOGRAFIAS_POR_TEMA[p.id]) expect(ids.has(t)).toBe(true);
    }
  });

  // Reproduce derivarColorDeVariante (paletas.ts) con sus mismos
  // porcentajes (MEZCLA): en un tema oscuro el acento se aclara con blanco.
  // Cada par es un texto real sobre el fondo real donde aparece (PE-2 suma
  // la superficie de las tarjetas, el botón de turno y la sección "contraste").
  for (const paleta of PALETAS_PAGINA_PUBLICA) {
    const m = paleta.oscuro ? MEZCLA.oscuro : MEZCLA.claro;
    const fondo = aRgb(paleta.fondoBase);
    const superficie = aRgb(paleta.superficie ?? MARFIL);
    const texto = aRgb(paleta.texto ?? GRAFITO);
    // Lo que va encima del acento: marfil en un tema claro, el fondo en uno oscuro (aplicar.ts).
    const sobreAcento = paleta.oscuro ? fondo : aRgb(MARFIL);

    it(`${paleta.id}: el texto del cuerpo cumple AA sobre el fondo y sobre las tarjetas`, () => {
      expect(contraste(texto, fondo)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(texto, superficie)).toBeGreaterThanOrEqual(4.5);
      // Al 70% (el tono más tenue que usan los módulos), sobre el fondo.
      expect(contraste(mezclar(texto, fondo, 70), fondo)).toBeGreaterThanOrEqual(4.5);
    });

    for (const v of paleta.variantes) {
      const acento = aRgb(v.hex);
      const fondoSuave = mezclar(acento, fondo, m.fondo);
      const acentoTexto = mezclar(acento, BASE[m.con === "black" ? "negro" : "blanco"], m.texto);

      it(`${v.id} (${v.nombre}): el texto de acento cumple AA sobre su fondo suave y sobre el fondo de la página`, () => {
        expect(contraste(acentoTexto, fondoSuave)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(acentoTexto, fondo)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${v.id} (${v.nombre}): el cuerpo se lee sobre una sección de color suave`, () => {
        expect(contraste(texto, fondoSuave)).toBeGreaterThanOrEqual(4.5);
      });

      it(`${v.id} (${v.nombre}): el botón relleno y la sección "contraste" cumplen AA`, () => {
        // Los dos son "sobreAcento" sobre el acento oscurecido/aclarado.
        expect(contraste(sobreAcento, acentoTexto)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("estiloDeTema", () => {
  it("sin tema (o desconocido) no toca nada: ni estilo, ni tokens de estilo", () => {
    const e = estiloDeTema("", "", "", { forma: "recta", menu: "barra" });
    expect(e.activo).toBe(false);
    expect(e.className).toBe("");
    expect(e.style).toEqual({});
    expect(e.tokens).toEqual(TOKENS_POR_DEFECTO);
    expect(estiloDeTema("inventado", "x", "y").activo).toBe(false);
  });

  it("sin tema, la variante de portada SÍ rige (es layout, no estilo)", () => {
    expect(estiloDeTema("", "", "", { portada: "dividida" }).tokens.portada).toBe("dividida");
  });

  it("un tema de antes de PE-2 sin tokens elegidos define los mismos valores que los defaults de .pp-raiz", () => {
    // globals.css (.pp-raiz): radio de tarjeta, p-6, borde de medio píxel, sin sombra.
    const style = estiloDeTema("calido", "calido-1", "").style as Record<string, string>;
    expect(style["--pp-radio"]).toBe("var(--radius-card)");
    expect(style["--pp-relleno"]).toBe("1.5rem");
    expect(style["--pp-borde-ancho"]).toBe("0.5px");
    expect(style["--pp-sombra"]).toBe("0 0 #0000");
    expect(style["--pp-superficie"]).toBeUndefined();
    expect(style["--pp-texto"]).toBeUndefined();
  });

  it("los tokens elegidos pisan los del tema", () => {
    const e = estiloDeTema("editorial", "editorial-1", "", { forma: "redonda" });
    expect(e.tokens.forma).toBe("redonda");
    expect(e.tokens.menu).toBe("subrayado"); // del tema
    expect((e.style as Record<string, string>)["--pp-radio"]).toBe("28px");
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
