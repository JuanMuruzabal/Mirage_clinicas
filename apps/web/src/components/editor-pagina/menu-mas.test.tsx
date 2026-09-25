import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuMas } from "./menu-mas";

// El menú "Más" del editor en un celular (PP-5, H15): un desplegable, no un
// role="menu" — se recorre con Tab y se cierra con Escape, tocando afuera o
// eligiendo una acción.

function dibujar(onElegir = vi.fn()) {
  render(
    <>
      <MenuMas acciones={[{ id: "a", etiqueta: "Historial", onElegir }, { id: "b", etiqueta: "Ver página", href: "/sol" }]} />
      <p>afuera</p>
    </>,
  );
  return screen.getByRole("button", { name: "Más" });
}

describe("MenuMas", () => {
  it("cerrado no muestra las acciones; abierto sí, en una lista que el botón controla", async () => {
    const mas = dibujar();
    expect(screen.queryByRole("button", { name: "Historial" })).not.toBeInTheDocument();
    await userEvent.click(mas);
    expect(document.getElementById(mas.getAttribute("aria-controls")!)).toContainElement(screen.getByRole("button", { name: "Historial" }));
    expect(screen.getByRole("link", { name: "Ver página" })).toHaveAttribute("target", "_blank");
  });

  it("Escape lo cierra y devuelve el foco al botón", async () => {
    const mas = dibujar();
    await userEvent.click(mas);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Historial" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(mas).toHaveAttribute("aria-expanded", "false");
    expect(mas).toHaveFocus();
  });

  it("tocar afuera lo cierra", async () => {
    const mas = dibujar();
    await userEvent.click(mas);
    await userEvent.click(screen.getByText("afuera"));
    expect(mas).toHaveAttribute("aria-expanded", "false");
  });

  it("elegir una acción la ejecuta, cierra y deja el foco en Más", async () => {
    const onElegir = vi.fn();
    const mas = dibujar(onElegir);
    await userEvent.click(mas);
    await userEvent.click(screen.getByRole("button", { name: "Historial" }));
    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(mas).toHaveAttribute("aria-expanded", "false");
    expect(mas).toHaveFocus();
  });
});
