import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/panel") }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { PanelSidebarProvider, usePanelSidebar } = await import("./panel-sidebar-context");

// El drawer mobile del panel se cierra en cada navegación, y esa regla
// vive en el PROVIDER — no en `PanelSidebar` (2026-09-19).
//
// La diferencia no es de estilo: `PanelSidebar` vive en
// `app/panel/layout.tsx` y se DESMONTA al salir de /panel, que es justo
// la navegación que había que atender. El provider vive en el layout
// raíz y sobrevive, así que es el único lugar desde el que se puede ver
// esa salida.
//
// Estos tests montan el provider SIN el sidebar a propósito: es el
// escenario de "ya no estoy en /panel", y es el que la implementación
// anterior no podía cubrir.

// Una ventana al estado del drawer, sin depender de cómo lo dibuja el
// sidebar (que acá ni siquiera está montado).
function Sonda() {
  const { open, toggle } = usePanelSidebar();
  return (
    <>
      <button type="button" onClick={toggle}>
        toggle
      </button>
      <span data-testid="estado">{open ? "abierto" : "cerrado"}</span>
    </>
  );
}

function montar() {
  const utils = render(
    <PanelSidebarProvider>
      <Sonda />
    </PanelSidebarProvider>,
  );
  const renavegar = (ruta: string) => {
    usePathnameMock.mockReturnValue(ruta);
    utils.rerender(
      <PanelSidebarProvider>
        <Sonda />
      </PanelSidebarProvider>,
    );
  };
  return { ...utils, renavegar };
}

const estado = () => screen.getByTestId("estado").textContent;

describe("PanelSidebarProvider — el drawer se retrae al navegar", () => {
  it("arranca cerrado", () => {
    usePathnameMock.mockReturnValue("/panel");
    montar();
    expect(estado()).toBe("cerrado");
  });

  // EL caso que la implementación anterior no cubría: salir de /panel
  // desmonta el sidebar, así que si la regla vivía ahí no corría nunca.
  it("se cierra al SALIR de /panel, aunque el sidebar ya no esté montado", async () => {
    usePathnameMock.mockReturnValue("/panel/turnos");
    const user = userEvent.setup();
    const { renavegar } = montar();

    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(estado()).toBe("abierto");

    renavegar("/personalizar-pagina");

    expect(estado()).toBe("cerrado");
  });

  // La otra mitad del pedido: "cada vez que se entre este debe estar
  // retraído". Entrar a /panel es también un cambio de ruta, así que la
  // misma regla lo cubre — nunca se llega con el drawer desplegado.
  it("se cierra también al ENTRAR a /panel", async () => {
    usePathnameMock.mockReturnValue("/clinicas");
    const user = userEvent.setup();
    const { renavegar } = montar();

    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(estado()).toBe("abierto");

    renavegar("/panel");

    expect(estado()).toBe("cerrado");
  });

  it("navegar DENTRO del panel también lo cierra", async () => {
    usePathnameMock.mockReturnValue("/panel");
    const user = userEvent.setup();
    const { renavegar } = montar();

    await user.click(screen.getByRole("button", { name: "toggle" }));
    renavegar("/panel/pacientes");

    expect(estado()).toBe("cerrado");
  });

  // Un re-render sin cambio de ruta no puede cerrarlo: el drawer se
  // cierra al NAVEGAR, no cada vez que React vuelve a pintar.
  it("un re-render en la misma ruta lo deja abierto", async () => {
    usePathnameMock.mockReturnValue("/panel");
    const user = userEvent.setup();
    const { renavegar } = montar();

    await user.click(screen.getByRole("button", { name: "toggle" }));
    renavegar("/panel");

    expect(estado()).toBe("abierto");
  });
});
