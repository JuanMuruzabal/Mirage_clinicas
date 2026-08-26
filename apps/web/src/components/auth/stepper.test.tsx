import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stepper } from "./stepper";

describe("Stepper", () => {
  it("marca el paso actual y los anteriores como completados", () => {
    render(<Stepper actual="clinica" />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("✓");
    expect(items[1]).toHaveTextContent("✓");
    expect(items[2]).toHaveTextContent("3");
  });

  it("el primer paso no muestra ningún check todavía", () => {
    render(<Stepper actual="cuenta" />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1");
    expect(items[1]).not.toHaveTextContent("✓");
    expect(items[2]).not.toHaveTextContent("✓");
  });
});
