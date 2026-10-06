import { beforeEach, describe, expect, it, vi } from "vitest";

// Las acciones de los anexos de continuación (5.6d).

const api = vi.hoisted(() => ({
  apiCrearContinuacion: vi.fn(),
  apiGetDocumento: vi.fn(),
  apiSumarAsiento: vi.fn(),
}));
const { getSessionTokenMock, redirectMock, revalidatePathMock } = vi.hoisted(() => ({
  getSessionTokenMock: vi.fn(),
  redirectMock: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/api", () => api);
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const { crearContinuacionAction, leerDocumentoAction, sumarAsientoAction } = await import("./documentos");

const anexo = { id: "c1", paciente: { id: "pac-1" }, continuacion: { seccion: "plan", numero: 1 } };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionTokenMock.mockResolvedValue("un-token");
});

describe("acciones de los anexos de continuación", () => {
  it("crear revalida el anexo, la ficha y la historia", async () => {
    api.apiCrearContinuacion.mockResolvedValue({ ok: true, data: anexo });
    await expect(crearContinuacionAction("h1", "plan")).resolves.toEqual({ ok: true, documento: anexo });
    expect(api.apiCrearContinuacion).toHaveBeenCalledWith("un-token", "h1", "plan");
    const rutas = revalidatePathMock.mock.calls.map(([r]) => r);
    expect(rutas).toEqual(expect.arrayContaining(["/panel/documentos", "/panel/documentos/c1", "/panel/pacientes/pac-1", "/panel/documentos/h1"]));
  });

  it("crear que falla no revalida nada y devuelve el error", async () => {
    api.apiCrearContinuacion.mockResolvedValue({ ok: false, status: 409, error: "esta sección ya tiene su anexo de continuación" });
    await expect(crearContinuacionAction("h1", "plan")).resolves.toEqual({ ok: false, error: "esta sección ya tiene su anexo de continuación" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("leer no revalida", async () => {
    api.apiGetDocumento.mockResolvedValue({ ok: true, data: anexo });
    await expect(leerDocumentoAction("c1")).resolves.toEqual({ ok: true, documento: anexo });
    api.apiGetDocumento.mockResolvedValue({ ok: false, status: 404, error: "documento no encontrado" });
    await expect(leerDocumentoAction("c1")).resolves.toEqual({ ok: false, error: "documento no encontrado" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("una anotación (sin firma dibujada) revalida el anexo; si falla, no", async () => {
    api.apiSumarAsiento.mockResolvedValue({ ok: true, data: anexo });
    await expect(sumarAsientoAction("c1", "Control.")).resolves.toEqual({ ok: true, documento: anexo });
    expect(api.apiSumarAsiento).toHaveBeenCalledWith("un-token", "c1", "Control.");
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/documentos/c1");

    revalidatePathMock.mockClear();
    api.apiSumarAsiento.mockResolvedValue({ ok: false, status: 400, error: "escribí la anotación" });
    await expect(sumarAsientoAction("c1", "")).resolves.toEqual({ ok: false, error: "escribí la anotación" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sin sesión, a ingresar", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(crearContinuacionAction("h1", "plan")).rejects.toThrow("REDIRECT:/ingresar");
    await expect(sumarAsientoAction("c1", "x")).rejects.toThrow("REDIRECT:/ingresar");
    await expect(leerDocumentoAction("c1")).rejects.toThrow("REDIRECT:/ingresar");
    expect(api.apiCrearContinuacion).not.toHaveBeenCalled();
  });
});
