import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { plantillaPorId, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { muestrasSiFaltan } from "@/lib/documentos-de-muestra";
import { paginasDelOriginal } from "@/lib/documentos-originales";
import { conducto, todoTipo } from "./fixtures";
import { HojaDeMuestra } from "./hoja-de-muestra";
import { PilaDeModelos } from "./pila-de-modelos";

// La pila de modelos (2026-10-02): las hojas de atrás ocupan la caja de la
// de ADELANTE, no la de su propio papel. Los modelos vienen en carta
// (8,5 × 11) y en A4 (más alto); con el tamaño de su modelo, detrás de una
// carta asomaba una A4 más larga de un lado y una carta del otro.

const implantes = plantillaPorId("consentimiento-implantes") as Plantilla; // A4
const extraccion = plantillaPorId("consentimiento-extraccion") as Plantilla; // carta

const CAJA_DE_ATRAS = ["absolute", "top-2", "bottom-4", "left-[14%]", "right-[14%]"];

function hojasDeAtras(): HTMLElement[] {
  return Array.from(screen.getByTestId("pila-de-modelos").querySelectorAll<HTMLElement>(".pila-hoja"));
}

function papel(p: Plantilla): "carta" | "a4" {
  const [primera] = paginasDelOriginal(p.id, p.version);
  return primera.alto / primera.ancho > 1.35 ? "a4" : "carta";
}

describe("PilaDeModelos: las hojas de atrás miden lo que la de adelante", () => {
  it("los fixtures mezclan papeles: carta y A4", () => {
    expect(papel(conducto)).toBe("carta");
    expect(papel(extraccion)).toBe("carta");
    expect(papel(implantes)).toBe("a4");
  });

  it.each([
    ["una carta adelante, A4 y carta atrás", [implantes, conducto, extraccion], conducto],
    ["una A4 adelante, cartas atrás", [conducto, implantes, extraccion], implantes],
    ["una carta adelante, A4 de un lado y carta del otro (al revés)", [extraccion, conducto, implantes], conducto],
  ])("%s", (_, enOrden, elegida) => {
    render(<PilaDeModelos enOrden={enOrden} elegida={elegida} hoy="2026-10-02" />);
    const atras = hojasDeAtras();
    expect(atras).toHaveLength(2);
    for (const hoja of atras) {
      // La misma caja que el relleno de la pila (px-[14%] pt-2 pb-4): el alto
      // lo pone la hoja de adelante, no el papel del vecino.
      expect(hoja).toHaveClass(...CAJA_DE_ATRAS);
      expect(hoja).not.toHaveClass("top-0");
      const img = hoja.querySelector("img") as HTMLImageElement;
      expect(img).not.toBeNull();
      // La imagen llena la caja y se recorta, sin estirarse ni medir su papel.
      expect(img).toHaveClass("h-full", "w-full", "object-cover", "object-top");
      expect(img).not.toHaveClass("h-auto");
    }
    // Las dos con exactamente la misma caja: simétricas.
    expect(atras[0].className.replace("pila-hoja--izquierda", "")).toBe(atras[1].className.replace("pila-hoja--derecha", ""));
    // La de adelante no: mide su propia página.
    const frente = screen.getByTestId("pila-de-modelos").querySelector(".pila-frente img") as HTMLImageElement;
    expect(frente).not.toHaveClass("object-cover");
    // El relleno de la pila es la caja de la de adelante.
    expect(screen.getByTestId("pila-de-modelos")).toHaveClass("px-[14%]", "pt-2", "pb-4");
  });

  it("la que se va conserva su tamaño: solo el ancho y el borde de arriba", () => {
    const { rerender } = render(<PilaDeModelos enOrden={[implantes, conducto, extraccion]} elegida={conducto} hoy="2026-10-02" />);
    rerender(<PilaDeModelos enOrden={[implantes, conducto, extraccion]} elegida={implantes} hoy="2026-10-02" />);
    const sale = screen.getByTestId("pila-de-modelos").querySelector<HTMLElement>(".pila-sale") as HTMLElement;
    expect(sale).toHaveClass("absolute", "top-2", "left-[14%]", "right-[14%]");
    expect(sale).not.toHaveClass("bottom-4");
    const img = sale.querySelector("img") as HTMLImageElement;
    expect(img).toHaveClass("h-auto");
    expect(img).not.toHaveClass("object-cover");
    // Y las de atrás siguen llenando la caja con la nueva de adelante.
    for (const hoja of hojasDeAtras()) expect(hoja).toHaveClass(...CAJA_DE_ATRAS);
  });

  it("una hoja de muestra atrás también llena la caja", () => {
    const [m1, m2] = muestrasSiFaltan(1);
    render(<PilaDeModelos enOrden={[m1, conducto, m2]} elegida={conducto} hoy="2026-10-02" />);
    for (const hoja of hojasDeAtras()) {
      expect(hoja).toHaveClass(...CAJA_DE_ATRAS);
      const dibujo = hoja.firstElementChild as HTMLElement;
      expect(dibujo).toHaveClass("h-full");
      expect(dibujo).not.toHaveClass("aspect-[8.5/11]");
    }
  });

  it("un modelo sin original atrás es una hoja en blanco que llena la caja", () => {
    render(<PilaDeModelos enOrden={[todoTipo, conducto, extraccion]} elegida={conducto} hoy="2026-10-02" />);
    const izquierda = hojasDeAtras().find((h) => h.classList.contains("pila-hoja--izquierda")) as HTMLElement;
    expect(izquierda.querySelector("img")).toBeNull();
    const blanca = izquierda.firstElementChild as HTMLElement;
    expect(blanca).toHaveClass("h-full", "w-full", "bg-white");
    expect(blanca).not.toHaveClass("aspect-[8.5/11]");
  });

  it("el CSS achica las de atrás desde el centro: asoman parejo a cada lado", () => {
    const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
    expect(css).toMatch(/\.pila-hoja,\s*\.pila-sale,\s*\.pila-frente\s*\{\s*transform-origin:\s*50% 50%;/);
    const izq = css.match(/\.pila-hoja--izquierda\s*\{\s*transform:\s*translateX\((-?[\d.]+)%\)\s*scale\(([\d.]+)\)/);
    const der = css.match(/\.pila-hoja--derecha\s*\{\s*transform:\s*translateX\((-?[\d.]+)%\)\s*scale\(([\d.]+)\)/);
    expect(izq && der).toBeTruthy();
    expect(Number(izq![1])).toBe(-Number(der![1]));
    expect(izq![2]).toBe(der![2]);
  });
});

describe("HojaDeMuestra: llenar", () => {
  const [modelo] = muestrasSiFaltan(0);

  it("por defecto mide en proporción carta", () => {
    render(<HojaDeMuestra modelo={modelo} />);
    const hoja = screen.getByRole("img", { name: `${modelo.nombre}: hoja de muestra` });
    expect(hoja).toHaveClass("aspect-[8.5/11]", "w-full");
    expect(hoja).not.toHaveClass("h-full");
  });

  it("con llenar toma el alto de su caja", () => {
    render(<HojaDeMuestra modelo={modelo} llenar />);
    const hoja = screen.getByRole("img", { name: `${modelo.nombre}: hoja de muestra` });
    expect(hoja).toHaveClass("h-full", "w-full");
    expect(hoja).not.toHaveClass("aspect-[8.5/11]");
  });

  it("decorativa y con llenar: sin rol ni nombre, y llena", () => {
    const { container } = render(<HojaDeMuestra modelo={modelo} decorativa llenar />);
    const hoja = container.firstElementChild as HTMLElement;
    expect(hoja).not.toHaveAttribute("role");
    expect(hoja).not.toHaveAttribute("aria-label");
    expect(hoja).toHaveClass("h-full");
  });
});
