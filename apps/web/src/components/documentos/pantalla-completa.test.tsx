import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PantallaCompleta } from "./pantalla-completa";

// El botón de pantalla completa: suelto (el editor y la vista del documento,
// "Ver en pantalla completa") o como par del control de páginas de la pila
// de modelos (`variante="en-barra"`, pedido del cliente 2026-10-02).

describe("PantallaCompleta", () => {
  it("por defecto dice 'Ver en pantalla completa', con el aspecto suelto", () => {
    render(
      <PantallaCompleta titulo="Hoja">
        <p>contenido</p>
      </PantallaCompleta>,
    );
    const boton = screen.getByRole("button", { name: "Ver en pantalla completa" });
    expect(boton).toHaveClass("min-h-11", "rounded-full", "px-4", "text-sm", "bg-marfil", "border-linea", "shadow-soft", "whitespace-nowrap");
    expect(boton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("contenido")).not.toBeInTheDocument();
  });

  it("con `etiqueta` y `variante='en-barra'`: el texto corto y el aspecto del control de páginas", () => {
    render(
      <PantallaCompleta titulo="Hoja" etiqueta="Pantalla completa" variante="en-barra" className="extra">
        <p>contenido</p>
      </PantallaCompleta>,
    );
    const boton = screen.getByRole("button", { name: "Pantalla completa" });
    expect(boton).toHaveTextContent(/^Pantalla completa$/);
    // El par del control de páginas: su alto, radio, letra, fondo, borde y sombra.
    expect(boton).toHaveClass(
      "min-h-10",
      "rounded-card",
      "px-3",
      "text-[13px]",
      "pointer-coarse:min-h-11",
      "bg-marfil",
      "border-linea",
      "shadow-soft",
      "extra",
    );
    expect(boton).not.toHaveClass("rounded-full");
    expect(boton).not.toHaveClass("min-h-11");
  });

  it("la etiqueta no cambia lo que hace: abre la capa con el contenido y se cierra", () => {
    render(
      <PantallaCompleta titulo="Hoja de prueba" etiqueta="Pantalla completa" variante="en-barra">
        <p>contenido</p>
      </PantallaCompleta>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pantalla completa" }));
    const capa = screen.getByRole("dialog", { name: "Hoja de prueba" });
    expect(capa).toHaveTextContent("contenido");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
