import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const elegirVistaActionMock = vi.fn();
vi.mock("@/app/actions/topbar-panel", () => ({
  elegirVistaAction: (...args: unknown[]) => elegirVistaActionMock(...args),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const { LinkConVista } = await import("./link-con-vista");

beforeEach(() => {
  elegirVistaActionMock.mockReset();
  elegirVistaActionMock.mockResolvedValue({});
  pushMock.mockReset();
});

// Fase 3.2.6, QA: "si interactúo con un botón que me lleva a otro
// módulo... el flujo deberá ser coherente con la vista".
describe("LinkConVista", () => {
  it("sin userId es un link común", async () => {
    const user = userEvent.setup();
    render(
      <LinkConVista href="/panel/turnos">
        <span>ir</span>
      </LinkConVista>,
    );

    await user.click(screen.getByText("ir"));

    // No hay agenda que cambiar: no se llama al backend.
    expect(elegirVistaActionMock).not.toHaveBeenCalled();
  });

  // Desde la vista general cada fila es de alguien distinto: tocarla
  // tiene que llevar a SU calendario, no al de quien venía en foco.
  it("con userId se para primero en esa agenda y después navega", async () => {
    const user = userEvent.setup();
    render(
      <LinkConVista href="/panel/calendario?vista=semana" userId="u7">
        <span>ir</span>
      </LinkConVista>,
    );

    await user.click(screen.getByText("ir"));

    await waitFor(() => expect(elegirVistaActionMock).toHaveBeenCalledWith("u7"));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/panel/calendario?vista=semana"));
  });

  it("el orden importa: la vista se cambia ANTES de navegar", async () => {
    const orden: string[] = [];
    elegirVistaActionMock.mockImplementation(async () => {
      orden.push("vista");
      return {};
    });
    pushMock.mockImplementation(() => orden.push("navegar"));
    const user = userEvent.setup();
    render(
      <LinkConVista href="/panel/turnos" userId="u7">
        <span>ir</span>
      </LinkConVista>,
    );

    await user.click(screen.getByText("ir"));

    // Al revés, el módulo de destino se renderizaría con la vista vieja
    // y habría que refrescar para ver lo correcto.
    await waitFor(() => expect(orden).toEqual(["vista", "navegar"]));
  });

  // Sigue siendo un <a> con href real: abrir en otra pestaña no puede
  // cambiar la vista de ESTA sesión.
  it("con ctrl/⌘ deja pasar el click sin tocar la vista", async () => {
    const user = userEvent.setup();
    render(
      <LinkConVista href="/panel/turnos" userId="u7">
        <span>ir</span>
      </LinkConVista>,
    );

    await user.keyboard("{Control>}");
    await user.click(screen.getByText("ir"));
    await user.keyboard("{/Control}");

    expect(elegirVistaActionMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("mantiene el href para poder copiarlo o abrirlo aparte", () => {
    render(
      <LinkConVista href="/panel/turnos?estado=resuelto" userId="u7">
        <span>ir</span>
      </LinkConVista>,
    );
    expect(screen.getByText("ir").closest("a")).toHaveAttribute("href", "/panel/turnos?estado=resuelto");
  });
});
