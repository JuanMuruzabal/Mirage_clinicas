import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stepper, PASOS_SUMARSE } from "./stepper";

describe("Stepper", () => {
  it("marca el paso actual y los anteriores como completados", () => {
    render(<Stepper pasos={PASOS_SUMARSE} actual="verificar" />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("✓");
    expect(items[1]).toHaveTextContent("2");
  });

  it("el primer paso no muestra ningún check todavía", () => {
    render(<Stepper pasos={PASOS_SUMARSE} actual="cuenta" />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1");
    expect(items[1]).not.toHaveTextContent("✓");
  });

  // El stepper sigue siendo genérico aunque hoy solo lo use /sumarse:
  // este caso lo verifica con un juego de pasos cualquiera.
  it("funciona con otro juego de pasos", () => {
    render(<Stepper pasos={[{ id: "uno", titulo: "Uno" }, { id: "dos", titulo: "Dos" }]} actual="dos" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("✓");
    expect(items[1]).toHaveTextContent("2");
  });
});
