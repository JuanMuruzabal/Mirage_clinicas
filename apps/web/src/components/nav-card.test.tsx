import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavCard } from "./nav-card";

describe("NavCard", () => {
  it("renderiza título, descripción y el link al href dado", () => {
    render(<NavCard href="/buscar" titulo="Buscá tu clínica" descripcion="Descripción de prueba" />);
    const link = screen.getByRole("link", { name: /Buscá tu clínica/ });
    expect(link).toHaveAttribute("href", "/buscar");
    expect(screen.getByText("Descripción de prueba")).toBeInTheDocument();
    expect(screen.getByText("Entrar →")).toBeInTheDocument();
  });

  it("muestra el eyebrow solo si se pasa", () => {
    const { rerender } = render(<NavCard href="/x" titulo="Título" descripcion="Desc" eyebrow="Eyebrow" />);
    expect(screen.getByText("Eyebrow")).toBeInTheDocument();

    rerender(<NavCard href="/x" titulo="Título" descripcion="Desc" />);
    expect(screen.queryByText("Eyebrow")).not.toBeInTheDocument();
  });

  it("acepta un cta y un size personalizados", () => {
    render(<NavCard href="/x" titulo="Título" descripcion="Desc" cta="Ver listado →" size="large" />);
    expect(screen.getByText("Ver listado →")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3 })).toHaveClass("text-3xl");
  });
});
