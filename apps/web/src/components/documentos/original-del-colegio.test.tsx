import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { plantillaPorId, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { conducto, todoTipo } from "./fixtures";
import { OriginalDelColegio } from "./original-del-colegio";

const ortodoncia = plantillaPorId("consentimiento-ortodoncia") as Plantilla;

describe("OriginalDelColegio", () => {
  // Ortodoncia son las páginas 5 y 6 del PDF del Colegio: el texto
  // alternativo decía "página 5 de 2".
  it("el texto alternativo usa la posición dentro del modelo, no el número de página del PDF", () => {
    render(<OriginalDelColegio plantilla={ortodoncia} hoy="2026-10-02" />);
    const imagenes = screen.getAllByRole("img");
    expect(imagenes.map((i) => i.getAttribute("alt"))).toEqual([
      `${ortodoncia.nombre}: modelo original del Colegio, página 1 de 2`,
      `${ortodoncia.nombre}: modelo original del Colegio, página 2 de 2`,
    ]);
    // Las imágenes siguen siendo las páginas 5 y 6 del PDF.
    expect(imagenes[0].getAttribute("src")).toContain("/pagina-5.w1600.webp");
    expect(imagenes[1].getAttribute("src")).toContain("/pagina-6.w1600.webp");
    // La primera carga sin demora aunque su número de página no sea 1.
    expect(imagenes[0]).toHaveAttribute("loading", "eager");
    expect(imagenes[1]).toHaveAttribute("loading", "lazy");
  });

  it("con una sola página, sin \"página 1 de 1\"", () => {
    render(<OriginalDelColegio plantilla={conducto} hoy="2026-10-02" />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", `${conducto.nombre}: modelo original del Colegio`);
  });

  it("con `pagina`, solo esa página, con su posición en el texto alternativo", () => {
    const { rerender } = render(<OriginalDelColegio plantilla={ortodoncia} hoy="2026-10-02" pagina={2} />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img")).toHaveAttribute("alt", `${ortodoncia.nombre}: modelo original del Colegio, página 2 de 2`);
    expect(screen.getByRole("img").getAttribute("src")).toContain("/pagina-6.w1600.webp");

    // Fuera de rango se queda en los extremos.
    rerender(<OriginalDelColegio plantilla={ortodoncia} hoy="2026-10-02" pagina={9} />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", expect.stringContaining("página 2 de 2"));
    rerender(<OriginalDelColegio plantilla={ortodoncia} hoy="2026-10-02" pagina={0} />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", expect.stringContaining("página 1 de 2"));

    rerender(<OriginalDelColegio plantilla={conducto} hoy="2026-10-02" pagina={1} />);
    expect(screen.getByRole("img")).toHaveAttribute("alt", `${conducto.nombre}: modelo original del Colegio`);
  });

  it("sin original renderizado, el calco vacío (con o sin `pagina`)", () => {
    const { rerender, container } = render(<OriginalDelColegio plantilla={todoTipo} hoy="2026-10-02" />);
    expect(container.querySelector("img")).toBeNull();
    rerender(<OriginalDelColegio plantilla={todoTipo} hoy="2026-10-02" pagina={1} />);
    expect(container.querySelector("img")).toBeNull();
  });
});
