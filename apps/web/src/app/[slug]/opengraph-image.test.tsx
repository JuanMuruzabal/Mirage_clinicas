import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/og solo corre bajo el runtime de Next (Satori + resvg): acá alcanza con
// ver QUÉ se le pide dibujar y con qué opciones.
const { dibujado, cargarMock, fuenteMock } = vi.hoisted(() => ({
  dibujado: [] as { elemento: ReactElement; opciones: Record<string, unknown> }[],
  cargarMock: vi.fn(),
  fuenteMock: vi.fn(),
}));
vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(elemento: ReactElement, opciones: Record<string, unknown>) {
      dibujado.push({ elemento, opciones });
    }
  },
}));
vi.mock("@/lib/pagina-publica/cargar", () => ({ cargarClinicaPublica: cargarMock }));
vi.mock("@/lib/pagina-publica/tarjeta-compartir", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pagina-publica/tarjeta-compartir")>()),
  fuenteDelTitulo: fuenteMock,
}));

const { default: Image, size } = await import("./opengraph-image");

const clinica = {
  slug: "clinica-sol",
  nombreClinica: "Clínica Sol",
  especialidades: ["Ortodoncia", "Endodoncia"],
  ciudad: "Córdoba",
  enPreparacion: false,
  oculta: false,
  tema: "clinico",
  temaVariante: "clinico-1",
  temaTipografia: "geometrica-moderna",
};

async function generar(slug = "clinica-sol") {
  await Image({ params: Promise.resolve({ slug }) });
  const ultimo = dibujado[dibujado.length - 1];
  return { html: renderToStaticMarkup(ultimo.elemento), opciones: ultimo.opciones };
}

beforeEach(() => {
  dibujado.length = 0;
  vi.clearAllMocks();
  fuenteMock.mockResolvedValue(new ArrayBuffer(8));
});

describe("opengraph-image de /[slug]", () => {
  it("una página publicada: nombre, especialidades, ciudad y el botón, con la tipografía del tema", async () => {
    cargarMock.mockResolvedValue({ ok: true, data: clinica });
    const { html, opciones } = await generar();
    expect(html).toContain("Clínica Sol");
    expect(html).toContain("Ortodoncia · Endodoncia");
    expect(html).toContain("Córdoba");
    expect(html).toContain("Pedí tu turno online");
    expect(fuenteMock).toHaveBeenCalledWith("Space Grotesk", 700);
    expect(opciones).toMatchObject({ width: size.width, height: size.height, headers: { "Cache-Control": "public, max-age=3600" } });
    expect((opciones.fonts as { name: string }[])[0].name).toBe("Space Grotesk");
  });

  it("en preparación: solo el nombre, sin contenido que no se publicó", async () => {
    cargarMock.mockResolvedValue({ ok: true, data: { ...clinica, enPreparacion: true } });
    const { html } = await generar();
    expect(html).toContain("Clínica Sol");
    expect(html).toContain("Página en preparación");
    expect(html).not.toContain("Ortodoncia");
    expect(html).not.toContain("Pedí tu turno online");
  });

  it("sin la fuente del tema (Google no respondió) sale igual, con la de next/og", async () => {
    cargarMock.mockResolvedValue({ ok: true, data: { ...clinica, oculta: true } });
    fuenteMock.mockResolvedValue(null);
    const { html, opciones } = await generar();
    expect(opciones.fonts).toBeUndefined();
    expect(html).not.toContain("Página en preparación");
  });

  it("un slug que no existe da una tarjeta genérica, no un error", async () => {
    cargarMock.mockResolvedValue({ ok: false, status: 404, error: "clínica no encontrada" });
    const { html } = await generar("no-existe");
    expect(html).toContain("PRISMA");
  });
});
