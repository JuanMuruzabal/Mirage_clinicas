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

  // Rama fix/mobile, undécima corrección (2026-08-24, pedido explícito del
  // cliente: "en mobile que la primera vista de la pagina el sidebar este
  // contraido no desplegado" — ver TR-034 en docs/tradeoffs.md).
  // vitest.setup.ts ya mockea `matchMedia` con `matches: false` por
  // defecto (así lo usan los tests de arriba, sin tocarlo) — acá se
  // sobreescribe puntualmente para simular un viewport mobile.
  it("arranca colapsado si el viewport es mobile (matchMedia coincide con el breakpoint)", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query === "(max-width: 767px)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    const { container } = render(<PanelSidebar />);
    expect(container.querySelector("aside")).toHaveClass("w-[52px]");

    window.matchMedia = original;
  });

  it("arranca expandido si el viewport NO es mobile (matchMedia no coincide)", () => {
    // El mock global (vitest.setup.ts) ya devuelve matches:false siempre
    // — este test lo deja explícito en vez de depender del default.
    const { container } = render(<PanelSidebar />);
    expect(container.querySelector("aside")).toHaveClass("w-60");
  });
});
