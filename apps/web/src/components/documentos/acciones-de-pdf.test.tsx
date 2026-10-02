import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("se tocan bien en el celular: más altas por debajo de md, y se acomodan si no entran", () => {
    const { container } = render(<AccionesDePDF id="doc-7" nombre="X" />);
    expect(container.firstElementChild).toHaveClass("flex-wrap");
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("max-md:min-h-10");
    }
  });
});
