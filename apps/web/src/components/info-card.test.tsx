import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfoCard } from "./info-card";

describe("InfoCard", () => {
  it("renderiza título y descripción, sin ningún link (solo informativa)", () => {
    const { container } = render(
      <InfoCard eyebrow="Cerca tuyo" titulo="Tu clínica más cercana" descripcion="Descripción de prueba" />,
    );
    expect(screen.getByText("Tu clínica más cercana")).toBeInTheDocument();
    expect(screen.getByText("Descripción de prueba")).toBeInTheDocument();
    expect(screen.getByText("Cerca tuyo")).toBeInTheDocument();
    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("el eyebrow es opcional", () => {
    render(<InfoCard titulo="Título" descripcion="Desc" />);
    expect(screen.getByText("Título")).toBeInTheDocument();
  });
});
