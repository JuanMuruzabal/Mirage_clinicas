import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { PanelNotificacionesResponse } from "@dental-mirage/shared-types";

const { panelNotificacionesActionMock, usePathnameMock } = vi.hoisted(() => ({
  panelNotificacionesActionMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/panel"),
}));
vi.mock("@/app/actions/panel", () => ({
  panelNotificacionesAction: panelNotificacionesActionMock,
}));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));

const { NotificacionesConflictoGlobal } = await import("./notificaciones-conflicto-global");

function notificaciones(overrides: Partial<PanelNotificacionesResponse> = {}): PanelNotificacionesResponse {
  return { conflictosPacientes: 0, conflictosCalendario: 0, ...overrides };
}

describe("NotificacionesConflictoGlobal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/panel");
  });

  it("no muestra nada sin conflictos", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones());
    render(<NotificacionesConflictoGlobal />);

    await waitFor(() => expect(panelNotificacionesActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("con un conflicto de pacientes, avisa y enlaza a /panel/pacientes", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 2 }));
    render(<NotificacionesConflictoGlobal />);

    const link = await screen.findByRole("link", { name: /conflictos con los pacientes/ });
    expect(link).toHaveAttribute("href", "/panel/pacientes");
  });

  it("con un conflicto de calendario, avisa y enlaza a /panel/calendario", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosCalendario: 1 }));
    render(<NotificacionesConflictoGlobal />);

    const link = await screen.findByRole("link", { name: /turno en conflicto en el calendario/ });
    expect(link).toHaveAttribute("href", "/panel/calendario");
  });

  it("estando en /panel/pacientes, NO repite el aviso de conflicto de pacientes (esa pantalla ya tiene el suyo)", async () => {
    usePathnameMock.mockReturnValue("/panel/pacientes");
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    render(<NotificacionesConflictoGlobal />);

    await waitFor(() => expect(panelNotificacionesActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /conflictos con los pacientes/ })).not.toBeInTheDocument();
  });

  it("estando en /panel/calendario, NO repite el aviso de conflicto de calendario (esa pantalla ya tiene el suyo)", async () => {
    usePathnameMock.mockReturnValue("/panel/calendario");
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosCalendario: 1 }));
    render(<NotificacionesConflictoGlobal />);

    await waitFor(() => expect(panelNotificacionesActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /turno en conflicto en el calendario/ })).not.toBeInTheDocument();
  });

  it("estando en /panel/pacientes, SÍ muestra el de calendario si corresponde (son avisos independientes)", async () => {
    usePathnameMock.mockReturnValue("/panel/pacientes");
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1, conflictosCalendario: 1 }));
    render(<NotificacionesConflictoGlobal />);

    expect(await screen.findByRole("link", { name: /turno en conflicto en el calendario/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /conflictos con los pacientes/ })).not.toBeInTheDocument();
  });

  it("usa singular cuando hay exactamente 1 conflicto", async () => {
    panelNotificacionesActionMock.mockResolvedValue(notificaciones({ conflictosPacientes: 1 }));
    render(<NotificacionesConflictoGlobal />);

    expect(await screen.findByText(/Tenés 1 conflicto con los pacientes/)).toBeInTheDocument();
  });
});
