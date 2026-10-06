import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  apiCrearDocumento: vi.fn(),
  apiDescartarBorrador: vi.fn(),
  apiFirmarDocumento: vi.fn(),
  apiGuardarBorrador: vi.fn(),
  apiTerminarDocumento: vi.fn(),
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

const {
  crearDocumentoAction,
  descartarBorradorAction,
  firmarDocumentoAction,
  guardarBorradorAction,
  terminarDocumentoAction,
} = await import("./documentos");

const documento = { id: "doc-1", paciente: { id: "pac-1" } };
const trazo = { ancho: 300, alto: 150, trazos: [] };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionTokenMock.mockResolvedValue("un-token");
});

describe("acciones de documentos", () => {
  it("sin sesión, a ingresar", async () => {
    getSessionTokenMock.mockResolvedValue(null);
    await expect(guardarBorradorAction("doc-1", {})).rejects.toThrow("REDIRECT:/ingresar");
  });

  it("crear lleva al editor; si falla, dice por qué", async () => {
    api.apiCrearDocumento.mockResolvedValue({ ok: true, data: documento });
    await expect(crearDocumentoAction("plantilla", "pac-1")).rejects.toThrow("REDIRECT:/panel/documentos/doc-1");
    expect(api.apiCrearDocumento).toHaveBeenCalledWith("un-token", "plantilla", "pac-1", undefined);

    // Ya había un borrador de ese documento para ese paciente: se retoma, y el editor lo avisa.
    api.apiCrearDocumento.mockResolvedValue({ ok: true, data: { ...documento, retomado: true } });
    await expect(crearDocumentoAction("plantilla", "pac-1")).rejects.toThrow("REDIRECT:/panel/documentos/doc-1?retomado=1");

    // Y era de una versión anterior del documento: pasó a la vigente, y el editor también lo avisa.
    api.apiCrearDocumento.mockResolvedValue({ ok: true, data: { ...documento, retomado: true, versionActualizada: true } });
    await expect(crearDocumentoAction("plantilla", "pac-1")).rejects.toThrow("REDIRECT:/panel/documentos/doc-1?retomado=1&actualizado=1");

    api.apiCrearDocumento.mockResolvedValue({ ok: false, status: 409, error: "conflicto" });
    await expect(crearDocumentoAction("plantilla", "pac-1")).resolves.toEqual({ error: "conflicto" });
  });

  it("guardar no revalida (el editor es dueño de lo que se escribe) y trae los errores por campo", async () => {
    api.apiGuardarBorrador.mockResolvedValue({ ok: true, data: documento });
    await expect(guardarBorradorAction("doc-1", { a: 1 })).resolves.toEqual({ ok: true, documento });
    expect(revalidatePathMock).not.toHaveBeenCalled();

    api.apiGuardarBorrador.mockResolvedValue({ ok: false, status: 422, error: "Revisá", errores: [{ campo: "a", mensaje: "mal" }] });
    await expect(guardarBorradorAction("doc-1", { a: 1 })).resolves.toEqual({ ok: false, error: "Revisá", errores: [{ campo: "a", mensaje: "mal" }] });
  });

  it("terminar y firmar revalidan el documento, el módulo y la ficha", async () => {
    for (const [accion, llamada, args] of [
      [terminarDocumentoAction, api.apiTerminarDocumento, ["doc-1"]],
      [firmarDocumentoAction, api.apiFirmarDocumento, ["doc-1", { rol: "profesional", trazo }]],
    ] as const) {
      vi.clearAllMocks();
      getSessionTokenMock.mockResolvedValue("un-token");
      llamada.mockResolvedValue({ ok: true, data: documento });
      await expect((accion as (...a: unknown[]) => Promise<unknown>)(...args)).resolves.toEqual({ ok: true, documento });
      expect(revalidatePathMock).toHaveBeenCalledWith("/panel/documentos/doc-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/panel/pacientes/pac-1");

      llamada.mockResolvedValue({ ok: false, status: 409, error: "no", errores: [] });
      await expect((accion as (...a: unknown[]) => Promise<unknown>)(...args)).resolves.toMatchObject({ ok: false, error: "no" });
    }
  });

  it("descartar vuelve al módulo; si falla, dice por qué", async () => {
    api.apiDescartarBorrador.mockResolvedValue({ ok: true, data: null });
    await expect(descartarBorradorAction("doc-1")).rejects.toThrow("REDIRECT:/panel/documentos");
    api.apiDescartarBorrador.mockResolvedValue({ ok: false, status: 409, error: "ya está sellado" });
    await expect(descartarBorradorAction("doc-1")).resolves.toEqual({ error: "ya está sellado" });
  });
});
