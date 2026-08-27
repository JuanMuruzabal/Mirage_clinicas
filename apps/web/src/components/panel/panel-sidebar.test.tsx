import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelSidebarProvider, usePanelSidebar } from "@/lib/panel-sidebar-context";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/panel/calendario") }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { PanelSidebar } = await import("./panel-sidebar");

// usePanelSidebar() (TR-075 en docs/tradeoffs.md) requiere el Provider
// del layout raíz — este botón expone el toggle para los tests, ya que
// el disparador real (la hamburguesa) vive en otro componente
// (site-header-chrome.tsx, fuera del árbol de PanelSidebar).
function BotonDePrueba() {
  const { toggle } = usePanelSidebar();
  return (
    <button type="button" onClick={toggle}>
      toggle-drawer
    </button>
  );
}

function renderSidebar() {
  return render(
    <PanelSidebarProvider>
      <BotonDePrueba />
      <PanelSidebar />
    </PanelSidebarProvider>,
  );
}

describe("PanelSidebar", () => {
  it("marca la sección activa según la ruta actual", () => {
    renderSidebar();
    const activo = screen.getByRole("link", { name: "Calendario" });
    expect(activo).toHaveClass("bg-salvia-claro");
  });

  it("lista Panel, General/Calendario/Turnos/Pacientes y Tu página/Tu perfil", () => {
    renderSidebar();
    for (const label of ["Panel", "General", "Calendario", "Turnos", "Pacientes", "Tu página", "Tu perfil"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // TR-075 en docs/tradeoffs.md (pedido explícito del cliente,
  // 2026-08-27): "agregar la opción para volver a seleccionar servicio,
  // con un botón que diga panel".
  it("'Panel' lleva a /seleccionar-servicio", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Panel" })).toHaveAttribute("href", "/seleccionar-servicio");
  });

  it("cada herramienta tiene su propio ícono (pedido explícito)", () => {
    const { container } = renderSidebar();
    // 4 secciones (General/Calendario/Turnos/Pacientes) = 4 <svg> distintos.
    const iconos = container.querySelectorAll("nav[aria-label='Gestión de clínica'] svg");
    expect(iconos).toHaveLength(4);
  });

  it("se puede retraer y expandir (solo escritorio)", async () => {
    const user = userEvent.setup();
    renderSidebar();

    const toggle = screen.getByRole("button", { name: "Retraer menú" });
    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Expandir menú" })).toBeInTheDocument();
    // Retraído: las etiquetas de texto dejan de mostrarse (title en su lugar).
    expect(screen.queryByText("General")).not.toBeInTheDocument();
  });

  // Rama fix/mobile, sexta corrección (2026-08-24, pedido explícito del
  // cliente: "sidebar colapsado más chico... 52px" — ver TR-029 en
  // docs/tradeoffs.md). El ancho colapsado ahora es solo de escritorio
  // (TR-075): `md:w-[52px]`, no `w-[52px]` a secas — en mobile el drawer
  // siempre es de ancho completo cuando está abierto.
  it("colapsado mide 52px en escritorio, con los íconos centrados", async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar();

    await user.click(screen.getByRole("button", { name: "Retraer menú" }));

    expect(container.querySelector("aside")).toHaveClass("md:w-[52px]");
    const activo = screen.getByRole("link", { name: "Calendario" });
    expect(activo).toHaveClass("justify-center");
  });

  it("'Tu página' y 'Tu perfil' tienen su propio ícono, igual que el resto (pedido explícito)", () => {
    const { container } = renderSidebar();

    const linkPagina = screen.getByRole("link", { name: "Tu página" });
    const linkPerfil = screen.getByRole("link", { name: "Tu perfil" });
    expect(linkPagina.querySelector("svg")).toBeInTheDocument();
    expect(linkPerfil.querySelector("svg")).toBeInTheDocument();

    // Con las dos herramientas de arriba (T2.1) da 6 <svg> en total —
    // "Panel" usa QuadrantMark, que es un <span>, no suma acá.
    const iconos = container.querySelectorAll("svg");
    expect(iconos).toHaveLength(6);
  });

  // TR-075 en docs/tradeoffs.md (pedido explícito del cliente,
  // 2026-08-27): "el sidebar debe ser desplegable desde el header...
  // en mobile" — reemplaza el criterio anterior (TR-034, arrancaba
  // colapsado en mobile detectando matchMedia): ahora es un drawer
  // binario controlado por PanelSidebarContext, cerrado por default.
  describe("drawer mobile", () => {
    it("arranca cerrado (fuera de pantalla)", () => {
      const { container } = renderSidebar();
      expect(container.querySelector("aside")).toHaveClass("-translate-x-full");
    });

    it("togglear desde el contexto lo abre (mismo mecanismo que la hamburguesa del header)", async () => {
      const user = userEvent.setup();
      const { container } = renderSidebar();

      await user.click(screen.getByRole("button", { name: "toggle-drawer" }));

      expect(container.querySelector("aside")).toHaveClass("translate-x-0");
      expect(container.querySelector("aside")).not.toHaveClass("-translate-x-full");
    });

    it("con el drawer abierto, hay un backdrop; clickearlo lo cierra", async () => {
      const user = userEvent.setup();
      const { container } = renderSidebar();

      await user.click(screen.getByRole("button", { name: "toggle-drawer" }));
      const backdrop = container.querySelector("aside")!.previousElementSibling as HTMLElement;
      expect(backdrop).toBeInTheDocument();

      await user.click(backdrop);
      expect(container.querySelector("aside")).toHaveClass("-translate-x-full");
    });

    it("cambiar de ruta cierra el drawer automáticamente", async () => {
      usePathnameMock.mockReturnValue("/panel/calendario");
      const user = userEvent.setup();
      const { container, rerender } = renderSidebar();

      await user.click(screen.getByRole("button", { name: "toggle-drawer" }));
      expect(container.querySelector("aside")).toHaveClass("translate-x-0");

      usePathnameMock.mockReturnValue("/panel/turnos");
      rerender(
        <PanelSidebarProvider>
          <BotonDePrueba />
          <PanelSidebar />
        </PanelSidebarProvider>,
      );

      expect(container.querySelector("aside")).toHaveClass("-translate-x-full");
    });
  });
});
