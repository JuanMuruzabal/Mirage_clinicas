import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { IconoAvance, IconoCasilleros, IconoEstadistica, IconoReloj, IconoSello, IconoTilde } from "./tarjeta-turnero-iconos";

// Puramente decorativos (aria-hidden) — el test solo verifica que cada
// uno renderiza un <svg> sin romper, con la clase pasada aplicada, y que
// queda oculto para lectores de pantalla (no es información real).
describe.each([
  ["IconoReloj", IconoReloj],
  ["IconoAvance", IconoAvance],
  ["IconoCasilleros", IconoCasilleros],
  ["IconoTilde", IconoTilde],
  ["IconoSello", IconoSello],
  ["IconoEstadistica", IconoEstadistica],
])("%s", (_nombre, Icono) => {
  it("renderiza un svg oculto para lectores de pantalla", () => {
    const { container } = render(<Icono />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("aplica el className pasado", () => {
    const { container } = render(<Icono className="h-10 w-10 text-salvia" />);
    expect(container.querySelector("svg")).toHaveClass("h-10", "w-10", "text-salvia");
  });
});
