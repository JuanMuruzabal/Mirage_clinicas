import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/panel/calendario") }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { PanelSidebar } = await import("./panel-sidebar");

describe("PanelSidebar", () => {
  it("marca la sección activa según la ruta actual", () => {
    render(<PanelSidebar />);
    const activo = screen.getByRole("link", { name: "Calendario" });
    expect(activo).toHaveClass("bg-salvia-claro");
  });

  it("lista General/Calendario/Turnos/Pacientes y Tu página/Tu perfil", () => {
    render(<PanelSidebar />);
    for (const label of ["General", "Calendario", "Turnos", "Pacientes", "Tu página", "Tu perfil"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("cada herramienta tiene su propio ícono (pedido explícito)", () => {
    const { container } = render(<PanelSidebar />);
    // 4 secciones (General/Calendario/Turnos/Pacientes) = 4 <svg> distintos.
    const iconos = container.querySelectorAll("nav[aria-label='Gestión de clínica'] svg");
    expect(iconos).toHaveLength(4);
  });

  it("se puede retraer y expandir", async () => {
    const user = userEvent.setup();
    render(<PanelSidebar />);

    const toggle = screen.getByRole("button", { name: "Retraer menú" });
    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Expandir menú" })).toBeInTheDocument();
    // Retraído: las etiquetas de texto dejan de mostrarse (title en su lugar).
    expect(screen.queryByText("General")).not.toBeInTheDocument();
  });

  // Rama fix/mobile, sexta corrección (2026-08-24, pedido explícito del
  // cliente: "sidebar colapsado más chico: cuando está colapsado,
  // reducí su ancho (~52px)... faltan items: agregá 'Tu página' y 'Tu
  // perfil' dentro del sidebar, cada uno con su icono" — ver TR-029 en
  // docs/tradeoffs.md).
  it("colapsado mide 52px, con los íconos centrados", async () => {
    const user = userEvent.setup();
    const { container } = render(<PanelSidebar />);

    await user.click(screen.getByRole("button", { name: "Retraer menú" }));

    expect(container.querySelector("aside")).toHaveClass("w-[52px]");
    const activo = screen.getByRole("link", { name: "Calendario" });
    expect(activo).toHaveClass("justify-center");
  });

  it("'Tu página' y 'Tu perfil' tienen su propio ícono, igual que el resto (pedido explícito)", () => {
    const { container } = render(<PanelSidebar />);

    const linkPagina = screen.getByRole("link", { name: "Tu página" });
    const linkPerfil = screen.getByRole("link", { name: "Tu perfil" });
    expect(linkPagina.querySelector("svg")).toBeInTheDocument();
    expect(linkPerfil.querySelector("svg")).toBeInTheDocument();

    // Con las dos herramientas de arriba (T2.1) da 6 <svg> en total.
    const iconos = container.querySelectorAll("svg");
    expect(iconos).toHaveLength(6);
  });
});
