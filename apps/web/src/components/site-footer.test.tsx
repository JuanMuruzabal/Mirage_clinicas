import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("muestra el nombre de marca y los links de navegación", () => {
    render(<SiteFooter />);
    expect(screen.getByText("Dental Mirage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar clínicas" })).toHaveAttribute("href", "/buscar");
    expect(screen.getByRole("link", { name: "Sumate" })).toHaveAttribute("href", "/sumarse");
    expect(screen.getByRole("link", { name: "Ingresar" })).toHaveAttribute("href", "/ingresar");
  });

  it("muestra el copyright con el año actual", () => {
    render(<SiteFooter />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${year} Dental Mirage`))).toBeInTheDocument();
  });

  it("tiene fondo oscuro, no blanco (pedido explícito) — grafito, no ink (TR-015)", () => {
    const { container } = render(<SiteFooter />);
    expect(container.querySelector("footer")).toHaveClass("bg-grafito");
  });
});
