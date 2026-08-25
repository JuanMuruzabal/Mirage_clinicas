import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathnameMock } = vi.hoisted(() => ({ usePathnameMock: vi.fn(() => "/panel/calendario") }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { PanelShell } = await import("./panel-shell");

// Rama fix/mobile, octava corrección (2026-08-24, pedido explícito del
// cliente: "sigue sin responder el movimiento vertical en el apartado de
// calendario... se arregla momentáneamente cuando cambio de dia a
// semana... mismo problema cuando toco la ficha de un paciente" — ver
// TR-031 en docs/tradeoffs.md). No se puede probar el bug de iOS Safari
// en sí desde jsdom (no simula reflow real) — este test confirma lo que
// sí se puede verificar: que el wrapper renderiza sus hijos sin romper
// nada, y que el toggle de `display` termina restaurado (no deja el
// contenido oculto).
describe("PanelShell", () => {
  it("renderiza los hijos (sidebar + contenido)", () => {
    render(
      <PanelShell>
        <p>contenido de prueba</p>
      </PanelShell>,
    );
    expect(screen.getByText("contenido de prueba")).toBeInTheDocument();
  });

  it("el contenedor raíz no queda oculto tras el reflow forzado", () => {
    const { container } = render(
      <PanelShell>
        <p>contenido</p>
      </PanelShell>,
    );
    const raiz = container.querySelector(".panel-texture");
    expect(raiz).toBeInTheDocument();
    expect((raiz as HTMLElement).style.display).not.toBe("none");
  });

  it("vuelve a renderizar (y a forzar el reflow) al cambiar de ruta, sin romper nada", () => {
    usePathnameMock.mockReturnValue("/panel/calendario");
    const { rerender, container } = render(
      <PanelShell>
        <p>Calendario</p>
      </PanelShell>,
    );
    expect(screen.getByText("Calendario")).toBeInTheDocument();

    usePathnameMock.mockReturnValue("/panel/pacientes/1");
    rerender(
      <PanelShell>
        <p>Ficha de paciente</p>
      </PanelShell>,
    );

    expect(screen.getByText("Ficha de paciente")).toBeInTheDocument();
    const raiz = container.querySelector(".panel-texture");
    expect((raiz as HTMLElement).style.display).not.toBe("none");
  });
});
