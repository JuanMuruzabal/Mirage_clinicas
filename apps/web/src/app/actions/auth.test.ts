import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  apiLoginMock,
  apiRegisterMock,
  apiUpdateMeMock,
  apiGoogleLoginMock,
  apiGoogleStateMock,
  apiVerificarEmailMock,
  apiReenviarVerificacionMock,
  apiRecuperarPasswordMock,
  apiResetPasswordMock,
  apiLogoutMock,
  apiOnboardingPerfilMock,
  apiOnboardingClinicaMock,
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
  apiGoogleLoginMock: vi.fn(),
  apiGoogleStateMock: vi.fn(),
  apiVerificarEmailMock: vi.fn(),
  apiReenviarVerificacionMock: vi.fn(),
  apiRecuperarPasswordMock: vi.fn(),
  apiResetPasswordMock: vi.fn(),
  apiLogoutMock: vi.fn(),
  apiOnboardingPerfilMock: vi.fn(),
  apiOnboardingClinicaMock: vi.fn(),
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
  apiGoogleLogin: apiGoogleLoginMock,
  apiGoogleState: apiGoogleStateMock,
  apiVerificarEmail: apiVerificarEmailMock,
  apiReenviarVerificacion: apiReenviarVerificacionMock,
  apiRecuperarPassword: apiRecuperarPasswordMock,
  apiResetPassword: apiResetPasswordMock,
  apiLogout: apiLogoutMock,
  apiOnboardingPerfil: apiOnboardingPerfilMock,
  apiOnboardingClinica: apiOnboardingClinicaMock,
}));
vi.mock("@/lib/session", () => ({
  setSessionCookie: setSessionCookieMock,
  clearSessionCookie: clearSessionCookieMock,
  getSessionToken: getSessionTokenMock,
}));

const {
  registerAction,
  loginAction,
  googleLoginAction,
  googleStateAction,
  verificarEmailAction,
  reenviarVerificacionAction,
  recuperarPasswordAction,
  resetPasswordAction,
  logoutAction,
  onboardingPerfilAction,
  onboardingClinicaAction,
  updateMeAction,
} = await import("./auth");

const perfilValido = {
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "+5493511234567",
  matriculaTipo: "nacional" as const,
  matriculaNumero: "MP-1",
  especialidadIds: ["e1"],
};

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

describe("registerAction", () => {
  it("valida con zod antes de llamar a la API — contraseña corta nunca llega al backend", async () => {
    const result = await registerAction({ email: "m@example.com", password: "corta", aceptaTerminos: true });
    expect(result).toEqual({ error: expect.stringContaining("12 caracteres") });
    expect(apiRegisterMock).not.toHaveBeenCalled();
  });

  it("con token en la respuesta, guarda la cookie sin redirigir", async () => {
    apiRegisterMock.mockResolvedValue({ ok: true, data: { token: "sesion-1", email: "m@example.com", mensaje: "ok" } });

    const result = await registerAction({ email: "m@example.com", password: "password123456", aceptaTerminos: true });

    expect(result).toEqual({ mensaje: "ok" });
    expect(setSessionCookieMock).toHaveBeenCalledWith("sesion-1");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("sin token en la respuesta (email ya existía), no guarda cookie — anti-enumeración", async () => {
    apiRegisterMock.mockResolvedValue({ ok: true, data: { email: "m@example.com", mensaje: "ok genérico" } });

    const result = await registerAction({ email: "m@example.com", password: "password123456", aceptaTerminos: true });

    expect(result).toEqual({ mensaje: "ok genérico" });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it("en error de la API, devuelve el mensaje", async () => {
    apiRegisterMock.mockResolvedValue({ ok: false, status: 500, error: "no se pudo crear la cuenta" });

    const result = await registerAction({ email: "m@example.com", password: "password123456", aceptaTerminos: true });
    expect(result).toEqual({ error: "no se pudo crear la cuenta" });
  });
});

describe("loginAction", () => {
  it("en éxito con mail verificado, guarda la cookie y redirige a /sumarse", async () => {
    apiLoginMock.mockResolvedValue({ ok: true, data: { token: "sesion-1", emailVerificado: true } });

    await expect(loginAction({ email: "m@example.com", password: "password123456" })).rejects.toThrow(
      "NEXT_REDIRECT:/sumarse",
    );
    expect(setSessionCookieMock).toHaveBeenCalledWith("sesion-1");
  });

  it("con mail sin verificar, devuelve el mensaje sin guardar cookie ni redirigir", async () => {
    apiLoginMock.mockResolvedValue({ ok: true, data: { emailVerificado: false, mensaje: "confirmá tu mail" } });

    const result = await loginAction({ email: "m@example.com", password: "password123456" });

    expect(result).toEqual({ mensaje: "confirmá tu mail" });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it("en error, devuelve el mensaje", async () => {
    apiLoginMock.mockResolvedValue({ ok: false, status: 401, error: "email o contraseña incorrectos" });

    const result = await loginAction({ email: "m@example.com", password: "password123456" });
    expect(result).toEqual({ error: "email o contraseña incorrectos" });
  });
});

describe("googleLoginAction / googleStateAction", () => {
  it("googleStateAction devuelve el state en éxito", async () => {
    apiGoogleStateMock.mockResolvedValue({ ok: true, data: { state: "abc" } });
    await expect(googleStateAction()).resolves.toEqual({ state: "abc" });
  });

  it("googleLoginAction guarda la cookie y redirige a /sumarse", async () => {
    apiGoogleLoginMock.mockResolvedValue({ ok: true, data: { token: "sesion-1", onboardingStep: "perfil" } });

    await expect(googleLoginAction({ code: "c", state: "s" })).rejects.toThrow("NEXT_REDIRECT:/sumarse");
    expect(setSessionCookieMock).toHaveBeenCalledWith("sesion-1");
  });
});

describe("verificarEmailAction", () => {
  it("guarda la cookie nueva y redirige a /sumarse", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    apiVerificarEmailMock.mockResolvedValue({ ok: true, data: { token: "sesion-2", onboardingStep: "perfil" } });

    await expect(verificarEmailAction("token-de-mail")).rejects.toThrow("NEXT_REDIRECT:/sumarse");
    expect(setSessionCookieMock).toHaveBeenCalledWith("sesion-2");
  });

  it("en error, devuelve el mensaje", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    apiVerificarEmailMock.mockResolvedValue({ ok: false, status: 400, error: "el link venció" });

    await expect(verificarEmailAction("token-vencido")).resolves.toEqual({ error: "el link venció" });
  });
});

describe("reenviarVerificacionAction / recuperarPasswordAction", () => {
  it("reenviarVerificacionAction devuelve el mensaje genérico", async () => {
    apiReenviarVerificacionMock.mockResolvedValue({ ok: true, data: { mensaje: "listo" } });
    await expect(reenviarVerificacionAction("m@example.com")).resolves.toEqual({ mensaje: "listo" });
  });

  it("recuperarPasswordAction valida el email con zod antes de llamar a la API", async () => {
    const result = await recuperarPasswordAction({ email: "no-es-un-email" });
    expect(result).toEqual({ error: expect.any(String) });
    expect(apiRecuperarPasswordMock).not.toHaveBeenCalled();
  });
});

describe("resetPasswordAction", () => {
  it("valida que las contraseñas coincidan antes de llamar a la API", async () => {
    const result = await resetPasswordAction({ token: "t", newPassword: "password123456", confirmarPassword: "otra" });
    expect(result).toEqual({ error: expect.stringContaining("no coinciden") });
    expect(apiResetPasswordMock).not.toHaveBeenCalled();
  });

  it("en éxito, guarda la cookie y redirige a /sumarse", async () => {
    apiResetPasswordMock.mockResolvedValue({ ok: true, data: { token: "sesion-3" } });

    await expect(
      resetPasswordAction({ token: "t", newPassword: "password123456", confirmarPassword: "password123456" }),
    ).rejects.toThrow("NEXT_REDIRECT:/sumarse");
    expect(setSessionCookieMock).toHaveBeenCalledWith("sesion-3");
  });
});

describe("logoutAction", () => {
  it("sin sesión, no llama a apiLogout pero limpia la cookie y redirige", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(apiLogoutMock).not.toHaveBeenCalled();
    expect(clearSessionCookieMock).toHaveBeenCalled();
  });

  it("con sesión, revoca en el backend antes de limpiar la cookie", async () => {
    getSessionTokenMock.mockResolvedValue("un-token");
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(apiLogoutMock).toHaveBeenCalledWith("un-token");
    expect(clearSessionCookieMock).toHaveBeenCalled();
  });
});

describe("onboardingPerfilAction", () => {
  it("redirige a /ingresar si no hay sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(onboardingPerfilAction(perfilValido)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, redirige a /sumarse", async () => {
    getSessionTokenMock.mockResolvedValue("un-token");
    apiOnboardingPerfilMock.mockResolvedValue({ ok: true, data: {} });

    await expect(onboardingPerfilAction(perfilValido)).rejects.toThrow("NEXT_REDIRECT:/sumarse");
  });

  it("en error, devuelve el mensaje sin redirigir", async () => {
    getSessionTokenMock.mockResolvedValue("un-token");
    apiOnboardingPerfilMock.mockResolvedValue({ ok: false, status: 400, error: "elegí al menos una especialidad" });

    const result = await onboardingPerfilAction(perfilValido);
    expect(result).toEqual({ error: "elegí al menos una especialidad" });
  });
});

describe("onboardingClinicaAction", () => {
  it("en éxito, redirige a /seleccionar-servicio", async () => {
    getSessionTokenMock.mockResolvedValue("un-token");
    apiOnboardingClinicaMock.mockResolvedValue({ ok: true, data: { clinicId: "c1", slug: "clinica", onboardingStep: "completo" } });

    await expect(onboardingClinicaAction({ tipo: "individual", nombre: "Clínica" })).rejects.toThrow(
      "NEXT_REDIRECT:/seleccionar-servicio",
    );
  });
});

describe("updateMeAction", () => {
  it("redirige a /ingresar si no hay sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(updateMeAction(perfilValido)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida /perfil", async () => {
    getSessionTokenMock.mockResolvedValue("un-token");
    apiUpdateMeMock.mockResolvedValue({ ok: true, data: {} });

    const result = await updateMeAction(perfilValido);

    expect(result).toBeUndefined();
    expect(revalidatePathMock).toHaveBeenCalledWith("/perfil");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-token");
    apiUpdateMeMock.mockResolvedValue({ ok: false, status: 400, error: "el nombre es obligatorio" });

    const result = await updateMeAction(perfilValido);

    expect(result).toEqual({ error: "el nombre es obligatorio" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
