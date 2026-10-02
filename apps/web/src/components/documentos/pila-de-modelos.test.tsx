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

// Lo que lee el lector de pantalla: "Página 1 de 4". En el celular,
// "Página" va en un sr-only, así que el texto está partido en dos nodos.
function contador() {
  return control().querySelector("[aria-live='polite']") as HTMLElement;
}

describe("PilaDeModelos: una página por vez", () => {
  it("un modelo de varias páginas muestra la 1 y se pasa de página con el control", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" />);
    const anterior = within(control()).getByRole("button", { name: "Página anterior" });
    const siguiente = within(control()).getByRole("button", { name: "Página siguiente" });
    expect(contador()).toHaveTextContent("Página 1 de 4");
    expect(hojaDeAdelante().getAttribute("src")).toContain("/pagina-1.w1600.webp");
    expect(hojaDeAdelante()).toHaveAttribute("alt", expect.stringContaining("página 1 de 4"));
    // Una sola página adelante, no las cuatro apiladas.
    expect(screen.getByTestId("pila-de-modelos").querySelectorAll(".pila-frente img")).toHaveLength(1);

    // En la primera, "anterior" está apagado.
    expect(anterior).toBeDisabled();
    expect(siguiente).toBeEnabled();

    fireEvent.click(siguiente);
    expect(contador()).toHaveTextContent("Página 2 de 4");
    expect(hojaDeAdelante().getAttribute("src")).toContain("/pagina-2.w1600.webp");
    expect(anterior).toBeEnabled();

    fireEvent.click(siguiente);
    fireEvent.click(siguiente);
    expect(contador()).toHaveTextContent("Página 4 de 4");
    expect(hojaDeAdelante()).toHaveAttribute("alt", expect.stringContaining("página 4 de 4"));
    // En la última, "siguiente" está apagado: un click más no pasa nada.
    expect(siguiente).toBeDisabled();
    fireEvent.click(siguiente);
    expect(contador()).toHaveTextContent("Página 4 de 4");

    fireEvent.click(anterior);
    expect(contador()).toHaveTextContent("Página 3 de 4");
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
    expect(contador()).toHaveTextContent("Página 3 de 4");

    // A un documento de una página: el control desaparece.
    rerender(<PilaDeModelos enOrden={enOrden} elegida={conducto} hoy="2026-10-02" />);
    expect(screen.queryByRole("group", { name: "Páginas del modelo" })).not.toBeInTheDocument();
    const sale = screen.getByTestId("pila-de-modelos").querySelector(".pila-sale img");
    expect(sale?.getAttribute("src")).toContain("consentimiento-sedoanalgesia/v1/pagina-3.w1600.webp");

    // Y de vuelta al de cuatro: arranca otra vez en la 1.
    rerender(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" />);
    expect(contador()).toHaveTextContent("Página 1 de 4");
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

describe("PilaDeModelos: la barra del celular (accionesDelCelular)", () => {
  const boton = <button type="button">Pantalla completa</button>;

  // La barra es el elemento de arriba de la pila (su hermano anterior).
  function barra(): HTMLElement {
    return screen.getByTestId("pila-de-modelos").previousElementSibling as HTMLElement;
  }

  it("con varias páginas, el control y las acciones van en la misma barra; las acciones, solo por debajo de lg", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" accionesDelCelular={boton} />);
    const accion = screen.getByRole("button", { name: "Pantalla completa" });
    expect(barra()).toContainElement(control());
    expect(barra()).toContainElement(accion);
    expect(barra()).toHaveClass("mb-3", "flex", "items-stretch", "justify-center", "gap-2");
    // Con el control, la barra se ve también en la computadora.
    expect(barra()).not.toHaveClass("lg:hidden");
    expect(accion.parentElement).toHaveClass("lg:hidden");
    // El control primero, la pantalla completa al lado.
    expect(barra().firstElementChild).toBe(control());
  });

  it("en el celular el control dice '1 de 4', con 'Página' para el lector de pantalla", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" accionesDelCelular={boton} />);
    expect(within(contador()).getByText("Página", { exact: false })).toHaveClass("max-lg:sr-only");
    expect(contador()).toHaveTextContent("Página 1 de 4");
    expect(contador()).toHaveClass("whitespace-nowrap");
  });

  it("con una sola página, la barra queda solo en el celular (lg:hidden) y sin control", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={conducto} hoy="2026-10-02" accionesDelCelular={boton} />);
    expect(screen.queryByRole("group", { name: "Páginas del modelo" })).not.toBeInTheDocument();
    expect(barra()).toHaveClass("lg:hidden");
    expect(within(barra()).getAllByRole("button")).toHaveLength(1);
    expect(barra()).toContainElement(screen.getByRole("button", { name: "Pantalla completa" }));
  });

  it("sin acciones y con una sola página, no hay barra (ni su margen)", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={conducto} hoy="2026-10-02" />);
    expect(barra()).toBeNull();
  });

  it("sin acciones y con varias páginas, la barra tiene solo el control y se ve en la computadora", () => {
    render(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" />);
    expect(barra().children).toHaveLength(1);
    expect(barra()).not.toHaveClass("lg:hidden");
  });

  it("al pasar a un modelo de una página, la barra se queda con el botón y pasa a lg:hidden", () => {
    const { rerender } = render(<PilaDeModelos enOrden={enOrden} elegida={sedoanalgesia} hoy="2026-10-02" accionesDelCelular={boton} />);
    expect(barra()).not.toHaveClass("lg:hidden");
    rerender(<PilaDeModelos enOrden={enOrden} elegida={conducto} hoy="2026-10-02" accionesDelCelular={boton} />);
    expect(screen.queryByRole("group", { name: "Páginas del modelo" })).not.toBeInTheDocument();
    expect(barra()).toHaveClass("lg:hidden");
    expect(barra()).toContainElement(screen.getByRole("button", { name: "Pantalla completa" }));
  });
});
