import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ResponsiveTable } from "./responsive-table";

interface Item {
  id: string;
  nombre: string;
}

const items: Item[] = [
  { id: "1", nombre: "Uno" },
  { id: "2", nombre: "Dos" },
];

// TR-064 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// "desde md hacia arriba la tabla actual debe quedar exactamente igual,
// sin cambios visuales" — ResponsiveTable no reescribe la tabla que
// recibe, solo decide cuál de las dos ramas (tabla/cards) queda visible
// según el breakpoint (jsdom no evalúa media queries: acá se prueba que
// AMBAS ramas existen en el DOM con las clases correctas, no que una
// esté "oculta de verdad" — eso lo resuelve el CSS en el navegador real).
describe("ResponsiveTable", () => {
  it("envuelve la tabla en 'hidden md:block' sin tocar su contenido", () => {
    render(
      <ResponsiveTable
        items={items}
        getKey={(i) => i.id}
        table={<table aria-label="mi tabla" />}
        renderCard={(i) => <span>{i.nombre}</span>}
      />,
    );
    const tablaEl = screen.getByRole("table", { name: "mi tabla" });
    expect(tablaEl.parentElement).toHaveClass("hidden", "md:block");
  });

  it("renderiza una card por item, dentro de un contenedor 'md:hidden'", () => {
    render(
      <ResponsiveTable
        items={items}
        getKey={(i) => i.id}
        table={<table aria-label="mi tabla" />}
        renderCard={(i) => <span>Card de {i.nombre}</span>}
      />,
    );
    // `.closest("div")` desde el texto encuentra el wrapper POR ITEM (sin
    // clase, uno por card) — el contenedor real con `md:hidden` es el
    // padre de ese wrapper.
    const contenedor = screen.getByText("Card de Uno").closest("div")!.parentElement!;
    expect(contenedor).toHaveClass("md:hidden");
    expect(within(contenedor).getByText("Card de Uno")).toBeInTheDocument();
    expect(within(contenedor).getByText("Card de Dos")).toBeInTheDocument();
  });

  it("con la lista vacía y un `empty` provisto, muestra solo el mensaje vacío (ni tabla ni cards)", () => {
    render(
      <ResponsiveTable
        items={[]}
        getKey={(i: Item) => i.id}
        table={<table aria-label="mi tabla" />}
        renderCard={(i: Item) => <span>{i.nombre}</span>}
        empty={<p>No hay nada</p>}
      />,
    );
    expect(screen.getByText("No hay nada")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("con la lista vacía y SIN `empty`, sigue mostrando la tabla y la lista de cards (vacía)", () => {
    render(
      <ResponsiveTable
        items={[]}
        getKey={(i: Item) => i.id}
        table={<table aria-label="mi tabla" />}
        renderCard={(i: Item) => <span>{i.nombre}</span>}
      />,
    );
    expect(screen.getByRole("table", { name: "mi tabla" })).toBeInTheDocument();
  });
});
