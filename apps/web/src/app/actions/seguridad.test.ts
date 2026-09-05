import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, apiListBloqueosSeguridadMock, apiDesbloquearMailMock, apiDesbloquearIPMock, getSessionTokenMock } = vi.hoisted(
  () => ({
    redirectMock: vi.fn((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    }),
    apiListBloqueosSeguridadMock: vi.fn(),
    apiDesbloquearMailMock: vi.fn(),
    apiDesbloquearIPMock: vi.fn(),
    getSessionTokenMock: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api", () => ({
  apiListBloqueosSeguridad: apiListBloqueosSeguridadMock,
  apiDesbloquearMail: apiDesbloquearMailMock,
  apiDesbloquearIP: apiDesbloquearIPMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { listBloqueosSeguridadAction, desbloquearMailAction, desbloquearIPAction } = await import("./seguridad");

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

describe("listBloqueosSeguridadAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(listBloqueosSeguridadAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, devuelve los datos", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    const datos = { mailsBloqueados: [], ipsBloqueadas: [], auditoria: [] };
    apiListBloqueosSeguridadMock.mockResolvedValue({ ok: true, data: datos });

    const result = await listBloqueosSeguridadAction();

    expect(result).toEqual(datos);
    expect(apiListBloqueosSeguridadMock).toHaveBeenCalledWith("un-jwt");
  });

  it("en error, devuelve listas vacías", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiListBloqueosSeguridadMock.mockResolvedValue({ ok: false, status: 500, error: "no se pudo" });

    const result = await listBloqueosSeguridadAction();

    expect(result).toEqual({ mailsBloqueados: [], ipsBloqueadas: [], auditoria: [] });
  });
});

describe("desbloquearMailAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(desbloquearMailAction("id-1")).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, devuelve ok", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiDesbloquearMailMock.mockResolvedValue({ ok: true, data: { mensaje: "mail desbloqueado" } });

    const result = await desbloquearMailAction("id-1");

    expect(result).toEqual({ ok: true });
    expect(apiDesbloquearMailMock).toHaveBeenCalledWith("un-jwt", "id-1");
  });

  it("en error, devuelve el mensaje", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiDesbloquearMailMock.mockResolvedValue({ ok: false, status: 404, error: "bloqueo no encontrado" });

    const result = await desbloquearMailAction("id-1");

    expect(result).toEqual({ error: "bloqueo no encontrado" });
  });
});

describe("desbloquearIPAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(desbloquearIPAction("id-2")).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, devuelve ok", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiDesbloquearIPMock.mockResolvedValue({ ok: true, data: { mensaje: "IP desbloqueada" } });

    const result = await desbloquearIPAction("id-2");

    expect(result).toEqual({ ok: true });
    expect(apiDesbloquearIPMock).toHaveBeenCalledWith("un-jwt", "id-2");
  });

  it("en error, devuelve el mensaje", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiDesbloquearIPMock.mockResolvedValue({ ok: false, status: 404, error: "bloqueo no encontrado" });

    const result = await desbloquearIPAction("id-2");

    expect(result).toEqual({ error: "bloqueo no encontrado" });
  });
});
