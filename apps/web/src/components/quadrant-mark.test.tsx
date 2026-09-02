import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { QuadrantMark } from "./quadrant-mark";

describe("QuadrantMark", () => {
  it("renderiza 4 celdas y es decorativo (aria-hidden)", () => {
    const { container } = render(<QuadrantMark className="text-steel" />);
    const mark = container.querySelector("span");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark?.querySelectorAll("i")).toHaveLength(4);
    expect(mark?.className).toContain("text-steel");
  });

  it("sin estado, ningún cuadrante queda relleno", () => {
    const { container } = render(<QuadrantMark />);
    const llenos = container.querySelectorAll("i.bg-current");
    expect(llenos).toHaveLength(0);
  });

  it("estado 'agendado': los 4 cuadrantes llenos", () => {
    const { container } = render(<QuadrantMark estado="agendado" />);
    expect(container.querySelectorAll("i.bg-current")).toHaveLength(4);
  });

  it("estado 'cancelada': ninguno lleno, con tachado diagonal", () => {
    const { container } = render(<QuadrantMark estado="cancelada" />);
    expect(container.querySelectorAll("i.bg-current")).toHaveLength(0);
    // El tachado es el 5to <i>, fuera de la grilla 2x2.
    expect(container.querySelectorAll("i")).toHaveLength(5);
  });
});
