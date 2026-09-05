import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiPanelNotificacionesMock, getSessionTokenMock } = vi.hoisted(() => ({
  apiPanelNotificacionesMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiPanelNotificaciones: apiPanelNotificacionesMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { panelNotificacionesAction } = await import("./panel");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("panelNotificacionesAction", () => {
  // NUNCA redirige a /ingresar sin sesión — la llama un componente
  // montado en todo el panel (NotificacionesConflictoGlobal) desde un
  // efecto en segundo plano; "nada que avisar" es la respuesta segura.
  it("sin sesión, devuelve 'nada que avisar' en vez de redirigir", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    const result = await panelNotificacionesAction();
    expect(result).toEqual({ conflictosPacientes: 0, conflictosCalendario: 0 });
    expect(apiPanelNotificacionesMock).not.toHaveBeenCalled();
  });

  it("en éxito, devuelve los datos del backend", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    const data = { conflictosPacientes: 2, conflictosCalendario: 1 };
    apiPanelNotificacionesMock.mockResolvedValue({ ok: true, data });

    const result = await panelNotificacionesAction();

    expect(result).toEqual(data);
    expect(apiPanelNotificacionesMock).toHaveBeenCalledWith("un-jwt");
  });

  it("en error, devuelve 'nada que avisar' en vez de propagar el error", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiPanelNotificacionesMock.mockResolvedValue({ ok: false, status: 500, error: "falló" });

    const result = await panelNotificacionesAction();

    expect(result).toEqual({ conflictosPacientes: 0, conflictosCalendario: 0 });
  });
});
