import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, redirectMock, apiMeMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  apiMeMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: cookiesMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("./api", () => ({ apiMe: apiMeMock }));

// Import dinámico después de mockear — session.ts importa next/headers a
// nivel de módulo.
const { setSessionCookie, getSessionToken, clearSessionCookie, requireProfesional } = await import("./session");

function fakeCookieStore(value?: string) {
  const store = {
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(() => (value !== undefined ? { name: "dm_session", value } : undefined)),
  };
  cookiesMock.mockResolvedValue(store);
  return store;
}

describe("lib/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("setSessionCookie guarda el token como httpOnly", async () => {
    const store = fakeCookieStore();
    await setSessionCookie("un-jwt");
    expect(store.set).toHaveBeenCalledWith(
      "dm_session",
      "un-jwt",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });

  it("getSessionToken devuelve el valor de la cookie si existe", async () => {
    fakeCookieStore("un-jwt");
    await expect(getSessionToken()).resolves.toBe("un-jwt");
  });

  it("getSessionToken devuelve undefined sin cookie", async () => {
    fakeCookieStore(undefined);
    await expect(getSessionToken()).resolves.toBeUndefined();
  });

  it("clearSessionCookie borra la cookie", async () => {
    const store = fakeCookieStore("un-jwt");
    await clearSessionCookie();
    expect(store.delete).toHaveBeenCalledWith("dm_session");
  });

  it("requireProfesional redirige a /ingresar sin cookie", async () => {
    fakeCookieStore(undefined);
    await expect(requireProfesional()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("requireProfesional devuelve el profesional si el token es válido", async () => {
    fakeCookieStore("un-jwt");
    apiMeMock.mockResolvedValue({ ok: true, data: { id: "1", nombre: "María" } });
    await expect(requireProfesional()).resolves.toEqual({ id: "1", nombre: "María" });
  });

  it("requireProfesional limpia la cookie y redirige si el token ya no es válido", async () => {
    const store = fakeCookieStore("un-jwt-vencido");
    apiMeMock.mockResolvedValue({ ok: false, status: 401, error: "token inválido o expirado" });

    await expect(requireProfesional()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
    expect(store.delete).toHaveBeenCalledWith("dm_session");
  });
});
