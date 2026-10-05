import { beforeEach, describe, expect, it, vi } from "vitest";

// Las acciones de la 5.6b, ronda A: las historias de un paciente y el anexo
// que crea antes la Historia Clínica General.

const api = vi.hoisted(() => ({
  apiCrearDocumento: vi.fn(),
  apiDescartarBorrador: vi.fn(),
  apiFirmarDocumento: vi.fn(),
  apiGuardarBorrador: vi.fn(),
  apiTerminarDocumento: vi.fn(),
  apiHistoriasDelPaciente: vi.fn(),
}));
const { getSessionTokenMock, redirectMock } = vi.hoisted(() => ({
  getSessionTokenMock: vi.fn(),
  redirectMock: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
}));

vi.mock("@/lib/api", () => api);
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { crearDocumentoAction, historiasDelPacienteAction, crearAnexoConHistoriaGeneralAction } = await import("./documentos");

beforeEach(() => {
  vi.clearAllMocks();
  getSessionTokenMock.mockResolvedValue("un-token");
});

describe("acciones del vínculo anexo ↔ historia", () => {
  it("crear un anexo manda su historia", async () => {
    api.apiCrearDocumento.mockResolvedValue({ ok: true, data: { id: "a1" } });
    await expect(crearDocumentoAction("anexo-de-prueba", "pac-1", "h1")).rejects.toThrow("REDIRECT:/panel/documentos/a1");
    expect(api.apiCrearDocumento).toHaveBeenCalledWith("un-token", "anexo-de-prueba", "pac-1", "h1");
  });

  it("las historias del paciente, o por qué no", async () => {
    const historias = [{ id: "h1" }];
    api.apiHistoriasDelPaciente.mockResolvedValue({ ok: true, data: historias });
    await expect(historiasDelPacienteAction("pac-1")).resolves.toEqual({ ok: true, historias });
    expect(api.apiHistoriasDelPaciente).toHaveBeenCalledWith("un-token", "pac-1");

    api.apiHistoriasDelPaciente.mockResolvedValue({ ok: false, status: 500, error: "no se pudieron obtener las historias clínicas" });
    await expect(historiasDelPacienteAction("pac-1")).resolves.toEqual({ ok: false, error: "no se pudieron obtener las historias clínicas" });
  });

  it("sin sesión, a ingresar", async () => {
    getSessionTokenMock.mockResolvedValue(null);
    await expect(historiasDelPacienteAction("pac-1")).rejects.toThrow("REDIRECT:/ingresar");
    await expect(crearAnexoConHistoriaGeneralAction("anexo-de-prueba", "pac-1")).rejects.toThrow("REDIRECT:/ingresar");
    expect(api.apiCrearDocumento).not.toHaveBeenCalled();
  });

  it("crear el anexo con la General: primero la General, después el anexo colgado de ella, y abre el anexo", async () => {
    api.apiCrearDocumento
      .mockResolvedValueOnce({ ok: true, data: { id: "h-nueva" } })
      .mockResolvedValueOnce({ ok: true, data: { id: "a-nuevo", retomado: true } });
    await expect(crearAnexoConHistoriaGeneralAction("anexo-de-prueba", "pac-1")).rejects.toThrow(
      "REDIRECT:/panel/documentos/a-nuevo?retomado=1",
    );
    expect(api.apiCrearDocumento.mock.calls).toEqual([
      ["un-token", "historia-clinica-general", "pac-1"],
      ["un-token", "anexo-de-prueba", "pac-1", "h-nueva"],
    ]);
  });

  it("si la General no se crea, no intenta el anexo; si el anexo falla, dice por qué", async () => {
    api.apiCrearDocumento.mockResolvedValueOnce({ ok: false, status: 403, error: "completá tu perfil profesional" });
    await expect(crearAnexoConHistoriaGeneralAction("anexo-de-prueba", "pac-1")).resolves.toEqual({ error: "completá tu perfil profesional" });
    expect(api.apiCrearDocumento).toHaveBeenCalledTimes(1);

    api.apiCrearDocumento.mockReset();
    api.apiCrearDocumento
      .mockResolvedValueOnce({ ok: true, data: { id: "h-nueva" } })
      .mockResolvedValueOnce({ ok: false, status: 409, error: "ya tenés un borrador de este anexo para otra historia clínica" });
    await expect(crearAnexoConHistoriaGeneralAction("anexo-de-prueba", "pac-1")).resolves.toEqual({
      error: "ya tenés un borrador de este anexo para otra historia clínica",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
