import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { AccionesDePDF, rutaDelPDF, tienePDF } from "./acciones-de-pdf";

// El PDF de un documento terminado (Fase 5.3): "Imprimir" (en una pestaña
// nueva, inline) y "Descargar PDF", por la ruta del BFF.

describe("tienePDF", () => {
  it.each<[DocumentoResumen["estado"], boolean]>([
    ["para_imprimir", true],
    ["sellado", true],
    ["borrador", false],
    ["a_firmar", false],
    ["anulado", false],
  ])("%s → %s", (estado, esperado) => {
    expect(tienePDF({ estado, tienePDF: true })).toBe(esperado);
  });
});

describe("rutaDelPDF", () => {
  it("la ruta del BFF, con ?para=imprimir solo para imprimir", () => {
    expect(rutaDelPDF("doc-1")).toBe("/panel/documentos/doc-1/pdf");
    expect(rutaDelPDF("doc-1", false)).toBe("/panel/documentos/doc-1/pdf");
    expect(rutaDelPDF("doc-1", true)).toBe("/panel/documentos/doc-1/pdf?para=imprimir");
  });
});

describe("AccionesDePDF", () => {
  it("Imprimir abre el PDF inline en una pestaña nueva; Descargar PDF lo baja", () => {
    render(<AccionesDePDF id="doc-7" nombre="Consentimiento informado: Extracción" />);
    const imprimir = screen.getByRole("link", { name: "Imprimir Consentimiento informado: Extracción (se abre en una pestaña nueva)" });
    expect(imprimir).toHaveTextContent("Imprimir");
    expect(imprimir).toHaveAttribute("href", "/panel/documentos/doc-7/pdf?para=imprimir");
    expect(imprimir).toHaveAttribute("target", "_blank");
    expect(imprimir).toHaveAttribute("rel", "noopener");

    const descargar = screen.getByRole("link", { name: "Descargar PDF de Consentimiento informado: Extracción" });
    expect(descargar).toHaveTextContent("Descargar PDF");
    expect(descargar).toHaveAttribute("href", "/panel/documentos/doc-7/pdf");
    // La descarga se queda en la pestaña (el navegador baja el archivo).
    expect(descargar).not.toHaveAttribute("target");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("se tocan bien en el celular: una sola pastilla partida en dos, de 36 px por debajo de md", () => {
    render(<AccionesDePDF id="doc-7" nombre="X" />);
    const [imprimir, descargar] = screen.getAllByRole("link");
    // Las dos mitades, juntas en la misma fila: la línea que las separa es
    // el borde de la de la izquierda.
    expect(imprimir.parentElement).toBe(descargar.parentElement);
    expect(imprimir).toHaveClass("rounded-l-full");
    expect(descargar).toHaveClass("rounded-r-full", "border-l-0");
    for (const link of [imprimir, descargar]) {
      expect(link).toHaveClass("min-h-9", "md:min-h-8", "whitespace-nowrap");
    }
    // En el celular la descarga dice "PDF"; desde sm, "Descargar PDF".
    expect(within(descargar).getByText("PDF")).toHaveClass("sm:hidden");
    expect(within(descargar).getByText("Descargar PDF")).toHaveClass("max-sm:hidden");
  });
});

describe("AccionesDePDF: el control segmentado", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });

  // Lo mínimo para que la descarga del navegador llegue hasta el clic en el
  // <a download> temporal: devuelve los nombres con que se descargó.
  function descargasDelNavegador(): string[] {
    const clics: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clics.push(this.download);
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: () => "blob:x" });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: () => {} });
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, headers: new Headers(), blob: async () => new Blob(["%PDF"]), text: async () => "" }));
    return clics;
  }

  async function asentar() {
    for (let i = 0; i < 10; i++) await act(async () => {});
  }

  it("las dos mitades llevan su ícono y el nombre accesible completo, aunque en el celular diga 'PDF'", () => {
    render(<AccionesDePDF id="doc-3" nombre="Historia clínica: Odontología general" />);
    const imprimir = screen.getByRole("link", { name: "Imprimir Historia clínica: Odontología general (se abre en una pestaña nueva)" });
    const descargar = screen.getByRole("link", { name: "Descargar PDF de Historia clínica: Odontología general" });
    for (const mitad of [imprimir, descargar]) {
      const icono = mitad.querySelector("svg");
      expect(icono).not.toBeNull();
      expect(icono).toHaveAttribute("aria-hidden", "true");
      expect(mitad).toHaveClass("border-linea", "inline-flex");
    }
    expect(descargar).toHaveAttribute("download");
    // Cada una es media pastilla, no una entera.
    expect(imprimir).not.toHaveClass("rounded-full");
    expect(descargar).not.toHaveClass("rounded-full");
    // Una grilla que no las separa nunca en dos renglones; la tercera
    // columna absorbe el aviso de un error.
    expect(imprimir.parentElement).toHaveClass("grid", "grid-cols-[auto_auto_1fr]");
  });

  it("sin `nombreDeArchivo`, descarga como 'documento.pdf' si la API no manda nombre", async () => {
    const descargas = descargasDelNavegador();
    render(<AccionesDePDF id="doc-3" nombre="X" />);
    fireEvent.click(screen.getByRole("link", { name: "Descargar PDF de X" }));
    await asentar();
    expect(descargas).toEqual(["documento.pdf"]);
  });

  it("con `nombreDeArchivo`, ese es el sugerido", async () => {
    const descargas = descargasDelNavegador();
    render(<AccionesDePDF id="doc-3" nombre="X" nombreDeArchivo="anexo-x-folio-2.pdf" />);
    fireEvent.click(screen.getByRole("link", { name: "Descargar PDF de X" }));
    await asentar();
    expect(descargas).toEqual(["anexo-x-folio-2.pdf"]);
  });

  it("mientras baja, en el celular sigue diciendo 'PDF' (no ensancha la columna); desde sm, 'Preparando…'", async () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    render(<AccionesDePDF id="doc-3" nombre="X" />);
    const descargar = screen.getByRole("link", { name: "Descargar PDF de X" });
    fireEvent.click(descargar);
    await act(async () => {});
    expect(descargar).toHaveAttribute("aria-busy", "true");
    expect(descargar).toHaveClass("aria-busy:max-sm:animate-pulse");
    expect(within(descargar).getByText("PDF")).toHaveClass("sm:hidden");
    expect(within(descargar).getByText("Preparando…")).toHaveClass("max-sm:hidden");
  });

  it("'Guardar PDF' (el gesto venció en la app instalada): en el celular sigue 'PDF' y lo explica el aviso", async () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => ({ matches: true }) });
    Object.defineProperty(navigator, "canShare", { configurable: true, writable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: async () => {
        throw new DOMException("gesto", "NotAllowedError");
      },
    });
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, headers: new Headers(), blob: async () => new Blob(["%PDF"]), text: async () => "" }));
    try {
      render(<AccionesDePDF id="doc-3" nombre="X" />);
      fireEvent.click(screen.getByRole("link", { name: "Descargar PDF de X" }));
      await asentar();
      const guardar = screen.getByRole("link", { name: "Guardar PDF de X" });
      expect(within(guardar).getByText("PDF")).toHaveClass("sm:hidden");
      expect(within(guardar).getByText("Guardar PDF")).toHaveClass("max-sm:hidden");
      const aviso = screen.getByRole("status");
      expect(aviso).toHaveTextContent("El PDF está listo: tocá de nuevo para guardarlo.");
      expect(aviso).toHaveClass("col-span-3");
    } finally {
      delete (window as unknown as Record<string, unknown>).matchMedia;
      delete (navigator as unknown as Record<string, unknown>).share;
      delete (navigator as unknown as Record<string, unknown>).canShare;
    }
  });

  it("si la descarga falla, el aviso baja a su propio renglón de la grilla", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 409, headers: new Headers(), blob: async () => new Blob([]), text: async () => "sin lámina" }));
    render(<AccionesDePDF id="doc-3" nombre="X" />);
    fireEvent.click(screen.getByRole("link", { name: "Descargar PDF de X" }));
    await asentar();
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("Sin lámina");
    expect(aviso).toHaveClass("col-span-3");
  });
});
