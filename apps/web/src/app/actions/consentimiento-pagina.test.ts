import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock, apiActualizarAvalPaginaPublicaMock, getSessionTokenMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  apiActualizarAvalPaginaPublicaMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({ apiActualizarAvalPaginaPublica: apiActualizarAvalPaginaPublicaMock }));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { actualizarAvalPaginaPublicaAction } = await import("./consentimiento-pagina");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("actualizarAvalPaginaPublicaAction", () => {
  it("rechaza payloads incompletos antes de consultar la sesión o la API", async () => {
    const invalidos: unknown[] = [
      undefined,
      null,
      {},
      { clinicId: "", avalPaginaPublica: true },
      { clinicId: 7, avalPaginaPublica: true },
      { clinicId: "clinica-1", avalPaginaPublica: "sí" },
    ];

    for (const payload of invalidos) {
      await expect(actualizarAvalPaginaPublicaAction(payload as never)).resolves.toEqual({ error: "No se pudo actualizar el consentimiento." });
    }

    expect(getSessionTokenMock).not.toHaveBeenCalled();
    expect(apiActualizarAvalPaginaPublicaMock).not.toHaveBeenCalled();
  });

  it("devuelve un error claro si no hay sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);

    await expect(actualizarAvalPaginaPublicaAction({ clinicId: "clinica-1", avalPaginaPublica: true })).resolves.toEqual({
      error: "Iniciá sesión para actualizar el consentimiento.",
    });
    expect(apiActualizarAvalPaginaPublicaMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("devuelve el error de la API sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("jwt-clinica");
    apiActualizarAvalPaginaPublicaMock.mockResolvedValue({ ok: false, error: "No pertenece a esa clínica." });

    await expect(actualizarAvalPaginaPublicaAction({ clinicId: "clinica-1", avalPaginaPublica: false })).resolves.toEqual({
      error: "No pertenece a esa clínica.",
    });
    expect(apiActualizarAvalPaginaPublicaMock).toHaveBeenCalledWith("jwt-clinica", { clinicId: "clinica-1", avalPaginaPublica: false });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("en éxito devuelve el aval confirmado y revalida las dos vistas afectadas", async () => {
    getSessionTokenMock.mockResolvedValue("jwt-clinica");
    apiActualizarAvalPaginaPublicaMock.mockResolvedValue({
      ok: true,
      data: { clinicId: "clinica-confirmada", avalPaginaPublica: true },
    });

    await expect(actualizarAvalPaginaPublicaAction({ clinicId: "clinica-1", avalPaginaPublica: true })).resolves.toEqual({
      clinicId: "clinica-confirmada",
      avalPaginaPublica: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/perfil");
    expect(revalidatePathMock).toHaveBeenCalledWith("/personalizar-pagina");
  });
});
