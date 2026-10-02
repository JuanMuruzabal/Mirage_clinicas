import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { plantillaPorId, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { conducto, todoTipo } from "./fixtures";
import { PilaDeModelos } from "./pila-de-modelos";

// La pila de modelos (2026-10-02): la hoja de adelante muestra UNA página
// por vez, con un control arriba para pasarla; sin vaivén.

const sedoanalgesia = plantillaPorId("consentimiento-sedoanalgesia") as Plantilla;
const enOrden = [conducto, sedoanalgesia, todoTipo];

function hojaDeAdelante(): HTMLImageElement {
  return screen.getByTestId("pila-de-modelos").querySelector(".pila-frente img") as HTMLImageElement;
}

function control() {
  return screen.getByRole("group", { name: "Páginas del modelo" });
}

describe("PilaDeModelos: una página por vez", () => {
  it("un modelo de varias páginas muestra la 1 y se pasa de página con el control", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" />);
    const anterior = within(control()).getByRole("button", { name: "Página anterior" });
    const siguiente = within(control()).getByRole("button", { name: "Página siguiente" });
    expect(within(control()).getByText("Página 1 de 4")).toBeInTheDocument();
    expect(hojaDeAdelante().getAttribute("src")).toContain("/pagina-1.w1600.webp");
    expect(hojaDeAdelante()).toHaveAttribute("alt", expect.stringContaining("página 1 de 4"));
    // Una sola página adelante, no las cuatro apiladas.
    expect(screen.getByTestId("pila-de-modelos").querySelectorAll(".pila-frente img")).toHaveLength(1);

    // En la primera, "anterior" está apagado.
    expect(anterior).toBeDisabled();
    expect(siguiente).toBeEnabled();

    fireEvent.click(siguiente);
    expect(within(control()).getByText("Página 2 de 4")).toBeInTheDocument();
    expect(hojaDeAdelante().getAttribute("src")).toContain("/pagina-2.w1600.webp");
    expect(anterior).toBeEnabled();

    fireEvent.click(siguiente);
    fireEvent.click(siguiente);
    expect(within(control()).getByText("Página 4 de 4")).toBeInTheDocument();
    expect(hojaDeAdelante()).toHaveAttribute("alt", expect.stringContaining("página 4 de 4"));
    // En la última, "siguiente" está apagado: un click más no pasa nada.
    expect(siguiente).toBeDisabled();
    fireEvent.click(siguiente);
    expect(within(control()).getByText("Página 4 de 4")).toBeInTheDocument();

    fireEvent.click(anterior);
    expect(within(control()).getByText("Página 3 de 4")).toBeInTheDocument();
    expect(hojaDeAdelante().getAttribute("src")).toContain("/pagina-3.w1600.webp");
  });

  it("con una sola página no hay control", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={conducto} hoy="2026-10-02" />);
    expect(screen.queryByRole("group", { name: "Páginas del modelo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Página siguiente" })).not.toBeInTheDocument();
  });

  it("sin original (el calco), tampoco: el calco se ve entero", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={todoTipo} hoy="2026-10-02" />);
    expect(screen.queryByRole("group", { name: "Páginas del modelo" })).not.toBeInTheDocument();
  });

  it("al cambiar de documento vuelve a la página 1, y la hoja que se va conserva la que se veía", () => {
    const { rerender } = render(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" />);
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(within(control()).getByText("Página 3 de 4")).toBeInTheDocument();

    // A un documento de una página: el control desaparece.
    rerender(<PilaDeModelos enOrden={enOrden} elegida={conducto} hoy="2026-10-02" />);
    expect(screen.queryByRole("group", { name: "Páginas del modelo" })).not.toBeInTheDocument();
    const sale = screen.getByTestId("pila-de-modelos").querySelector(".pila-sale img");
    expect(sale?.getAttribute("src")).toContain("consentimiento-sedoanalgesia/v1/pagina-3.w1600.webp");

    // Y de vuelta al de cuatro: arranca otra vez en la 1.
    rerender(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" />);
    expect(within(control()).getByText("Página 1 de 4")).toBeInTheDocument();
    expect(hojaDeAdelante().getAttribute("src")).toContain("/pagina-1.w1600.webp");
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
  });

  it("sin vaivén: ni la capa que flotaba ni la amplitud por páginas; la inclinación sigue", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" />);
    const pila = screen.getByTestId("pila-de-modelos");
    expect(pila.querySelector(".pila-flota")).toBeNull();
    const frente = pila.querySelector(".pila-frente") as HTMLElement;
    expect(frente.style.getPropertyValue("--pila-amplitud")).toBe("");
    expect(pila.querySelector(".pila-frente .pila-inclina")).not.toBeNull();

    // Y el CSS ya no la define.
    const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
    expect(css).not.toContain("pila-flota");
    expect(css).not.toContain("--pila-amplitud");
    expect(css).toContain(".pila-inclina");
  });
});
