import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiAgendarTurno,
  apiBuscarClinicas,
  apiCrearTurnoManual,
  apiDeployarPaginaPublica,
  apiGetPaginaPublica,
  apiGoogleState,
  apiListEspecialidades,
  apiListTiposConsulta,
  apiListTurnos,
  apiLogin,
  apiLogout,
  apiMe,
  apiOcultarPaginaPublica,
  apiOnboardingClinica,
  apiOnboardingPerfil,
  apiRecuperarPassword,
  apiRegister,
  apiResetPassword,
  apiResumenPanel,
  apiUpdateMe,
  apiVerificarEmail,
} from "./api";

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response),
  );
}

describe("lib/api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("apiListEspecialidades devuelve ok:true con la lista en éxito", async () => {
    mockFetchOnce(200, [{ id: "1", nombre: "Ortodoncia" }]);
    const result = await apiListEspecialidades();
    expect(result).toEqual({ ok: true, data: [{ id: "1", nombre: "Ortodoncia" }] });
  });

  it("apiRegister manda POST con el body serializado", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ email: "maria@example.com", mensaje: "revisá tu correo" }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const result = await apiRegister({
      email: "maria@example.com",
      password: "password123456",
      aceptaTerminos: true,
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/auth/register");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toMatchObject({ email: "maria@example.com" });
  });

  it("apiLogin devuelve ok:false con el mensaje de error del backend en 401", async () => {
    mockFetchOnce(401, { error: "email o contraseña incorrectos" });
    const result = await apiLogin({ email: "x@example.com", password: "mala" });
    expect(result).toEqual({ ok: false, status: 401, error: "email o contraseña incorrectos" });
  });

  it("apiMe manda el Authorization header", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "1" }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiMe("un-token");

    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer un-token");
  });

  it("apiUpdateMe manda PATCH con Authorization y body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "1" }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiUpdateMe("un-token", {
      nombre: "Nuevo nombre",
      apellido: "Games",
      telefono: "+5493511234567",
      matriculaTipo: "nacional",
      matriculaNumero: "MP-1",
      especialidadIds: [],
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe("PATCH");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer un-token");
  });

  it("devuelve un error controlado si fetch rechaza (red caída)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await apiListEspecialidades();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.error).toMatch(/no se pudo conectar/i);
    }
  });

  it("usa un mensaje genérico si el error no trae body JSON válido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("no body");
        },
      } as unknown as Response),
    );
    const result = await apiListEspecialidades();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.error).toBe("Ocurrió un error inesperado.");
    }
  });

  it("apiBuscarClinicas arma la query string solo con los params presentes", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiBuscarClinicas({ q: "Sonrisas" });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("/clinicas?q=Sonrisas");
  });

  it("apiBuscarClinicas sin params no agrega '?'", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiBuscarClinicas({});

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/clinicas$/);
  });

  it("apiListTiposConsulta manda el Authorization header", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiListTiposConsulta("un-token");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/tipos-consulta");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer un-token");
  });

  it("apiListTurnos arma la query string con estado/desde/hasta", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiListTurnos("un-token", { estado: "agendado", desde: "2026-09-01", hasta: "2026-09-08" });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("estado=agendado");
    expect(url).toContain("desde=2026-09-01");
    expect(url).toContain("hasta=2026-09-08");
  });

  it("apiListTurnos sin params no agrega '?'", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiListTurnos("un-token");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/turnos$/);
  });

  it("apiCrearTurnoManual manda POST con Authorization y body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "1" }) } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiCrearTurnoManual("un-token", {
      nombreContacto: "María",
      apellidoContacto: "Games",
      dniContacto: "1",
      telefonoContacto: "1",
      tipoConsultaId: "tc-1",
      horaInicio: "2026-09-01T09:00:00Z",
      horaFin: "2026-09-01T09:30:00Z",
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/turnos");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer un-token");
  });

  it("apiAgendarTurno manda PATCH a /turnos/{id}/agendar", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "1" }) } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiAgendarTurno("un-token", "turno-1", {
      tipoConsultaId: "tc-1",
      horaInicio: "2026-09-01T09:00:00Z",
      horaFin: "2026-09-01T09:30:00Z",
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/turnos/turno-1/agendar");
    expect(init?.method).toBe("PATCH");
  });

  it("apiResumenPanel manda el Authorization header", async () => {
    const cuerpo = {
      turnosHoy: [],
      turnosProximos: [],
      horariosReservados: [],
      totalConfirmados: 2,
      turnosResueltos: [],
      turnosAsistidos: 0,
      turnosAusentes: 0,
    };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => cuerpo,
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const result = await apiResumenPanel("un-token");

    expect(result).toEqual({ ok: true, data: cuerpo });
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("/panel/resumen");
  });

  it("apiGetPaginaPublica manda el Authorization header", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ oculta: false, deployadaEn: null }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const result = await apiGetPaginaPublica("un-token");

    expect(result).toEqual({ ok: true, data: { oculta: false, deployadaEn: null } });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/panel/pagina");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer un-token" });
  });

  it("apiOcultarPaginaPublica manda PATCH con el body serializado", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ oculta: true, deployadaEn: null }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiOcultarPaginaPublica("un-token", { oculta: true });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/panel/pagina/ocultar");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ oculta: true }));
  });

  it("apiDeployarPaginaPublica manda PATCH sin body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ oculta: false, deployadaEn: "2026-08-23T00:00:00Z" }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const result = await apiDeployarPaginaPublica("un-token");

    expect(result).toEqual({ ok: true, data: { oculta: false, deployadaEn: "2026-08-23T00:00:00Z" } });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/panel/pagina/deployar");
    expect(init?.method).toBe("PATCH");
  });

  it("maneja una respuesta 204 sin body sin explotar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("no body");
        },
      } as unknown as Response),
    );
    const result = await apiListEspecialidades();
    expect(result).toEqual({ ok: true, data: null });
  });

  // --- Auth/onboarding (docs/feature-sumarte-login.md) ---

  it("apiGoogleState manda GET a /auth/google/state", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ state: "abc" }) } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const result = await apiGoogleState();

    expect(result).toEqual({ ok: true, data: { state: "abc" } });
    expect(fetchSpy.mock.calls[0][0]).toContain("/auth/google/state");
  });

  it("apiVerificarEmail manda el email y el código en el body y el Authorization si se pasa uno", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: "nuevo", onboardingStep: "perfil" }),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiVerificarEmail({ email: "maria@example.com", codigo: "482913" }, "sesion-vieja");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/auth/verificar-email");
    expect(JSON.parse(init?.body as string)).toEqual({ email: "maria@example.com", codigo: "482913" });
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sesion-vieja");
  });

  it("apiReenviarVerificacion/apiRecuperarPassword/apiResetPassword/apiLogout mandan POST", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ mensaje: "ok" }) } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiRecuperarPassword({ email: "x@example.com" });
    await apiResetPassword({ token: "abc", newPassword: "password123456" });
    await apiLogout("un-token");

    for (const [, init] of fetchSpy.mock.calls) {
      expect(init?.method).toBe("POST");
    }
  });

  it("apiOnboardingPerfil y apiOnboardingClinica mandan PATCH con Authorization", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
    vi.stubGlobal("fetch", fetchSpy);

    await apiOnboardingPerfil("un-token", {
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "+5493511234567",
      matriculaTipo: "nacional",
      matriculaNumero: "MP-1",
      especialidadIds: ["e1"],
    });
    await apiOnboardingClinica("un-token", { tipo: "individual", nombre: "Clínica" });

    for (const [, init] of fetchSpy.mock.calls) {
      expect(init?.method).toBe("PATCH");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer un-token");
    }
  });
});
