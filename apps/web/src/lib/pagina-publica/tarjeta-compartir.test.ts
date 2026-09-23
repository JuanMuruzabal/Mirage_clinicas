import { afterEach, describe, expect, it, vi } from "vitest";
import { TIPOGRAFIAS_PAGINA_PUBLICA } from "@/lib/temas-pagina-publica";
import { coloresDeTarjeta, familiaDelTitulo, fuenteDelTitulo, IDS_DE_TEMAS, TIPOGRAFIAS_CON_FAMILIA } from "./tarjeta-compartir";

const HEX = /^#[0-9a-f]{6}$/i;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("coloresDeTarjeta", () => {
  it("resuelve colores planos (sin color-mix) para cada tema del catálogo", () => {
    for (const tema of IDS_DE_TEMAS) {
      const colores = coloresDeTarjeta(tema, `${tema}-2`);
      for (const valor of Object.values(colores)) expect(valor, tema).toMatch(HEX);
    }
  });

  it("sin tema, la piel celeste de siempre; con una variante desconocida, la primera del tema", () => {
    expect(coloresDeTarjeta("", "").fondo).toBe("#e7f2f7");
    expect(coloresDeTarjeta("oscuro", "no-existe").acento).toBe(coloresDeTarjeta("oscuro", "oscuro-1").acento);
  });

  it("en un tema oscuro el texto sobre el acento va en el color del fondo", () => {
    const oscuro = coloresDeTarjeta("oscuro", "oscuro-1");
    expect(oscuro.sobreAcento).toBe(oscuro.fondo);
  });
});

describe("familiaDelTitulo", () => {
  it("cada tipografía del catálogo tiene su familia para la tarjeta", () => {
    expect([...TIPOGRAFIAS_CON_FAMILIA].sort()).toEqual(TIPOGRAFIAS_PAGINA_PUBLICA.map((t) => t.id).sort());
    expect(familiaDelTitulo("no-existe").familia).toBe("Big Shoulders");
  });
});

describe("fuenteDelTitulo", () => {
  it("pide el CSS a Google Fonts, baja el TTF y lo recuerda", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://fonts.googleapis.com")
        ? new Response("@font-face { src: url(https://fonts.gstatic.com/x.ttf) format('truetype'); }")
        : new Response(new Uint8Array([1, 2, 3])),
    );
    vi.stubGlobal("fetch", fetchMock);

    const datos = await fuenteDelTitulo("Fredoka", 600);
    expect(datos?.byteLength).toBe(3);
    await fuenteDelTitulo("Fredoka", 600);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("family=Fredoka:wght@600");
  });

  it("si Google no responde, null (la tarjeta sale con la fuente por defecto) y el próximo pedido reintenta", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("sin red");
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fuenteDelTitulo("Fraunces", 600)).toBeNull();
    expect(await fuenteDelTitulo("Fraunces", 600)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("un CSS sin TTF también da null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("@font-face { src: url(x.woff2) format('woff2'); }")));
    expect(await fuenteDelTitulo("Space Grotesk", 700)).toBeNull();
  });
});
