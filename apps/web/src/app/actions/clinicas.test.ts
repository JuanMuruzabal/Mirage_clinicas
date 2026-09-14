import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  apiElegirClinicaActivaMock,
  apiGenerarCodigoInvitacionMock,
  getSessionTokenMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  apiElegirClinicaActivaMock: vi.fn(),
  apiGenerarCodigoInvitacionMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({
  apiElegirClinicaActiva: apiElegirClinicaActivaMock,
  apiGenerarCodigoInvitacion: apiGenerarCodigoInvitacionMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { entrarEnClinicaAction, generarCodigoInvitacionAction } = await import("./clinicas");

describe("entrarEnClinicaAction (Fase 3.2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionTokenMock.mockResolvedValue("token-de-sesion");
  });

  it("guarda la clínica elegida y entra a la selección de servicio", async () => {
    apiElegirClinicaActivaMock.mockResolvedValue({ ok: true, data: { clinicaId: "clinica-1" } });

    await expect(entrarEnClinicaAction("clinica-1")).rejects.toThrow("NEXT_REDIRECT:/seleccionar-servicio");
    expect(apiElegirClinicaActivaMock).toHaveBeenCalledWith("token-de-sesion", "clinica-1");
  });

  // Media app lee `me.clinica` para saber dónde está parada. Sin
  // invalidar el layout raíz, se entraría a la clínica nueva con el
  // nombre de la anterior todavía en el header.
  it("invalida el layout raíz al cambiar de clínica", async () => {
    apiElegirClinicaActivaMock.mockResolvedValue({ ok: true, data: { clinicaId: "clinica-1" } });

    await expect(entrarEnClinicaAction("clinica-1")).rejects.toThrow("NEXT_REDIRECT:");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("devuelve el error del backend sin redirigir", async () => {
    apiElegirClinicaActivaMock.mockResolvedValue({ ok: false, error: "no trabajás en esa clínica" });

    await expect(entrarEnClinicaAction("clinica-ajena")).resolves.toEqual({ error: "no trabajás en esa clínica" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sin sesión, manda a ingresar", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);

    await expect(entrarEnClinicaAction("clinica-1")).rejects.toThrow("NEXT_REDIRECT:/ingresar");
    expect(apiElegirClinicaActivaMock).not.toHaveBeenCalled();
  });
});

describe("generarCodigoInvitacionAction (Fase 3.2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionTokenMock.mockResolvedValue("token-de-sesion");
  });

  it("devuelve el código generado", async () => {
    const codigo = { codigo: "PR-ABCD-EFGH", venceAt: "2026-09-14T12:00:00Z" };
    apiGenerarCodigoInvitacionMock.mockResolvedValue({ ok: true, data: codigo });

    await expect(generarCodigoInvitacionAction()).resolves.toEqual(codigo);
  });

  it("devuelve el error del backend", async () => {
    apiGenerarCodigoInvitacionMock.mockResolvedValue({ ok: false, error: "no se pudo generar el código" });

    await expect(generarCodigoInvitacionAction()).resolves.toEqual({ error: "no se pudo generar el código" });
  });

  it("sin sesión, manda a ingresar", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);

    await expect(generarCodigoInvitacionAction()).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });
});
