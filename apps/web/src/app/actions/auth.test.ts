import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  apiLoginMock,
  apiRegisterMock,
  apiUpdateMeMock,
  setSessionCookieMock,
  clearSessionCookieMock,
  getSessionTokenMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  apiLoginMock: vi.fn(),
  apiRegisterMock: vi.fn(),
  apiUpdateMeMock: vi.fn(),
  setSessionCookieMock: vi.fn(),
  clearSessionCookieMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({
  apiLogin: apiLoginMock,
  apiRegister: apiRegisterMock,
  apiUpdateMe: apiUpdateMeMock,
}));
vi.mock("@/lib/session", () => ({
  setSessionCookie: setSessionCookieMock,
  clearSessionCookie: clearSessionCookieMock,
  getSessionToken: getSessionTokenMock,
}));

const { registerAction, loginAction, logoutAction, updateMeAction } = await import("./auth");

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

describe("registerAction", () => {
  it("en éxito, guarda la cookie de sesión y redirige a /seleccionar-servicio", async () => {
    apiRegisterMock.mockResolvedValue({ ok: true, data: { token: "jwt", profesional: { id: "1" } } });

    await expect(
      registerAction({ nombre: "María", email: "m@example.com", password: "password123", nombreClinica: "Clínica" }),
    ).rejects.toThrow("NEXT_REDIRECT:/seleccionar-servicio");

    expect(setSessionCookieMock).toHaveBeenCalledWith("jwt");
  });

  it("en error, devuelve el mensaje sin redirigir", async () => {
    apiRegisterMock.mockResolvedValue({ ok: false, status: 409, error: "ya existe una cuenta con ese email" });

    const result = await registerAction({
      nombre: "María",
      email: "m@example.com",
      password: "password123",
      nombreClinica: "Clínica",
    });

    expect(result).toEqual({ error: "ya existe una cuenta con ese email" });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });
});

describe("loginAction", () => {
  it("en éxito, guarda la cookie y redirige", async () => {
    apiLoginMock.mockResolvedValue({ ok: true, data: { token: "jwt", profesional: { id: "1" } } });

    await expect(loginAction({ email: "m@example.com", password: "password123" })).rejects.toThrow(
      "NEXT_REDIRECT:/seleccionar-servicio",
    );
    expect(setSessionCookieMock).toHaveBeenCalledWith("jwt");
  });

  it("en error, devuelve el mensaje", async () => {
    apiLoginMock.mockResolvedValue({ ok: false, status: 401, error: "email o contraseña incorrectos" });

    const result = await loginAction({ email: "m@example.com", password: "mala" });
    expect(result).toEqual({ error: "email o contraseña incorrectos" });
  });
});

describe("logoutAction", () => {
  it("limpia la cookie y redirige a home", async () => {
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(clearSessionCookieMock).toHaveBeenCalled();
  });
});

describe("updateMeAction", () => {
  it("redirige a /ingresar si no hay sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(updateMeAction({ nombre: "María" })).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida /perfil", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiUpdateMeMock.mockResolvedValue({ ok: true, data: { id: "1" } });

    const result = await updateMeAction({ nombre: "María" });

    expect(result).toBeUndefined();
    expect(revalidatePathMock).toHaveBeenCalledWith("/perfil");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiUpdateMeMock.mockResolvedValue({ ok: false, status: 400, error: "el nombre es obligatorio" });

    const result = await updateMeAction({ nombre: "" });

    expect(result).toEqual({ error: "el nombre es obligatorio" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
