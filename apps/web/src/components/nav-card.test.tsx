import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavCard } from "./nav-card";

// Rediseño del 2026-10-19: NavCard es una envoltura de TarjetaConDibujo, con
// una sola composición (sin tamaños ni variante "principal") y el título en
// un h2.
describe("NavCard", () => {
  it("renderiza título, descripción y el link al href dado", () => {
    render(<NavCard href="/buscar" titulo="Buscá tu clínica" descripcion="Descripción de prueba" />);
    const link = screen.getByRole("link", { name: /Buscá tu clínica/ });
    expect(link).toHaveAttribute("href", "/buscar");
    expect(screen.getByText("Descripción de prueba")).toBeInTheDocument();
    expect(screen.getByText("Entrar")).toBeInTheDocument();
  });

  it("muestra el eyebrow solo si se pasa", () => {
    const { rerender } = render(<NavCard href="/x" titulo="Título" descripcion="Desc" eyebrow="Eyebrow" />);
    expect(screen.getByText("Eyebrow")).toBeInTheDocument();

    rerender(<NavCard href="/x" titulo="Título" descripcion="Desc" />);
    expect(screen.queryByText("Eyebrow")).not.toBeInTheDocument();
  });

  it("el título es un h2 y acepta un cta personalizado", () => {
    render(<NavCard href="/x" titulo="Título" descripcion="Desc" cta="Ver listado" />);
    expect(screen.getByRole("heading", { level: 2, name: "Título" })).toBeInTheDocument();
    expect(screen.getByText("Ver listado")).toBeInTheDocument();
  });

  it("toda la tarjeta es el link: el cta vive adentro, no como un botón aparte", () => {
    render(<NavCard href="/panel" titulo="Gestión de clínica" descripcion="Tu día a día" dibujo="agenda" />);
    const link = screen.getByRole("link", { name: /Gestión de clínica/ });
    expect(link).toHaveAttribute("href", "/panel");
    expect(link).toHaveTextContent("Entrar");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    // La escena es decoración, dentro del mismo link.
    expect(link.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });
});
