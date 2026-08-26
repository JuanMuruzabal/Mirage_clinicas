import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Me } from "@dental-mirage/shared-types";

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
const {
  setSessionCookie,
  getSessionToken,
  clearSessionCookie,
  getMe,
  requireSession,
  requireOnboardingComplete,
  redirectSiEmailVerificado,
  requireEmailVerificado,
} = await import("./session");

function fakeCookieStore(value?: string) {
  const store = {
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(() => (value !== undefined ? { name: "dm_session", value } : undefined)),
  };
  cookiesMock.mockResolvedValue(store);
  return store;
}

const meIncompleto: Me = {
  id: "1",
  email: "maria@example.com",
  emailVerificado: true,
  onboardingStep: "perfil",
  onboardingCompletado: false,
};

const meSinVerificar: Me = {
  id: "1",
  email: "maria@example.com",
  emailVerificado: false,
  onboardingStep: "cuenta",
  onboardingCompletado: false,
};

const meCompleto: Me = {
  id: "1",
  email: "maria@example.com",
  emailVerificado: true,
  onboardingStep: "completo",
  onboardingCompletado: true,
  perfil: {
    nombre: "María",
    apellido: "Games",
    telefonoPrefijo: "+54",
    telefono: "+5493511234567",
    matriculaTipo: "nacional",
    matriculaNumero: "MP-1",
    especialidades: [{ id: "e1", nombre: "Odontología general" }],
  },
  clinica: { id: "c1", nombre: "Clínica Games", slug: "clinica-games", tipo: "individual", rol: "owner" },
};

describe("lib/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("setSessionCookie guarda el token como httpOnly", async () => {
    const store = fakeCookieStore();
    await setSessionCookie("un-token");
    expect(store.set).toHaveBeenCalledWith(
      "dm_session",
      "un-token",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });

  it("getSessionToken devuelve el valor de la cookie si existe", async () => {
    fakeCookieStore("un-token");
    await expect(getSessionToken()).resolves.toBe("un-token");
  });

  it("getSessionToken devuelve undefined sin cookie", async () => {
    fakeCookieStore(undefined);
    await expect(getSessionToken()).resolves.toBeUndefined();
  });

  it("clearSessionCookie borra la cookie", async () => {
    const store = fakeCookieStore("un-token");
    await clearSessionCookie();
    expect(store.delete).toHaveBeenCalledWith("dm_session");
  });

  it("getMe devuelve null sin cookie", async () => {
    fakeCookieStore(undefined);
    await expect(getMe()).resolves.toBeNull();
  });

  it("getMe devuelve null si el token ya no es válido, sin tocar la cookie", async () => {
    // No debe llamar a store.delete: mutar cookies durante el render de
    // una página (getMe corre en Server Components, no en Server
    // Actions/Route Handlers) tira un 500 real en Next.js — ver TR-049 en
    // docs/tradeoffs.md.
    const store = fakeCookieStore("un-token-vencido");
    apiMeMock.mockResolvedValue({ ok: false, status: 401, error: "token inválido o expirado" });

    await expect(getMe()).resolves.toBeNull();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("getMe devuelve los datos si el token es válido", async () => {
    fakeCookieStore("un-token");
    apiMeMock.mockResolvedValue({ ok: true, data: meIncompleto });
    await expect(getMe()).resolves.toEqual(meIncompleto);
  });

  it("requireSession redirige a /ingresar sin cookie", async () => {
    fakeCookieStore(undefined);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("requireOnboardingComplete redirige a /sumarse con onboarding incompleto", async () => {
    fakeCookieStore("un-token");
    apiMeMock.mockResolvedValue({ ok: true, data: meIncompleto });
    await expect(requireOnboardingComplete()).rejects.toThrow("NEXT_REDIRECT:/sumarse");
  });

  it("requireOnboardingComplete devuelve la sesión aplanada con onboarding completo", async () => {
    fakeCookieStore("un-token");
    apiMeMock.mockResolvedValue({ ok: true, data: meCompleto });

    await expect(requireOnboardingComplete()).resolves.toEqual({
      id: "1",
      email: "maria@example.com",
      nombre: "María",
      apellido: "Games",
      telefonoPrefijo: "+54",
      telefono: "+5493511234567",
      documento: undefined,
      matriculaTipo: "nacional",
      matriculaNumero: "MP-1",
      aniosExperiencia: undefined,
      bio: undefined,
      idiomas: undefined,
      especialidades: [{ id: "e1", nombre: "Odontología general" }],
      nombreClinica: "Clínica Games",
      slug: "clinica-games",
      clinicaId: "c1",
      clinicaTipo: "individual",
      rol: "owner",
    });
  });

  it("requireOnboardingComplete redirige a /ingresar sin sesión", async () => {
    fakeCookieStore(undefined);
    await expect(requireOnboardingComplete()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("redirectSiEmailVerificado redirige a /seleccionar-servicio con el mail ya verificado (aunque el onboarding no haya terminado)", async () => {
    await expect(redirectSiEmailVerificado(meIncompleto)).rejects.toThrow(
      "NEXT_REDIRECT:/seleccionar-servicio",
    );
    await expect(redirectSiEmailVerificado(meCompleto)).rejects.toThrow(
      "NEXT_REDIRECT:/seleccionar-servicio",
    );
  });

  it("redirectSiEmailVerificado no hace nada sin sesión o con el mail sin verificar", async () => {
    await expect(redirectSiEmailVerificado(null)).resolves.toBeUndefined();
    await expect(redirectSiEmailVerificado(meSinVerificar)).resolves.toBeUndefined();
  });

  it("requireEmailVerificado redirige a /ingresar sin sesión", async () => {
    fakeCookieStore(undefined);
    await expect(requireEmailVerificado()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("requireEmailVerificado redirige a /sumarse con sesión pero mail sin verificar", async () => {
    fakeCookieStore("un-token");
    apiMeMock.mockResolvedValue({ ok: true, data: meSinVerificar });
    await expect(requireEmailVerificado()).rejects.toThrow("NEXT_REDIRECT:/sumarse");
  });

  it("requireEmailVerificado devuelve la sesión con el mail verificado, sin exigir onboarding completo", async () => {
    fakeCookieStore("un-token");
    apiMeMock.mockResolvedValue({ ok: true, data: meIncompleto });
    await expect(requireEmailVerificado()).resolves.toEqual(meIncompleto);
  });
});
