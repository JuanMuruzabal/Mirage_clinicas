import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiCrearDocumento,
  apiDescartarBorrador,
  apiDocumentosDePaciente,
  apiDocumentosEnCurso,
  apiFirmarDocumento,
  apiGetDocumento,
  apiGuardarBorrador,
  apiPacientesConDocumentos,
  apiTerminarDocumento,
  apiVolverAEditarDocumento,
} from "./api";

function espiarFetch(status: number, body: unknown) {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => vi.unstubAllGlobals());

describe("lib/api — documentos clínicos (Fase 5.1)", () => {
  it.each([
    ["pacientes con documentos", () => apiPacientesConDocumentos("t"), "/documentos/pacientes", "GET"],
    ["en curso", () => apiDocumentosEnCurso("t"), "/documentos/en-curso", "GET"],
    ["de un paciente", () => apiDocumentosDePaciente("t", "pac-1"), "/pacientes/pac-1/documentos", "GET"],
    ["un documento", () => apiGetDocumento("t", "doc-1"), "/documentos/doc-1", "GET"],
    ["crear", () => apiCrearDocumento("t", "plantilla", "pac-1"), "/documentos", "POST"],
    ["guardar", () => apiGuardarBorrador("t", "doc-1", { a: 1 }), "/documentos/doc-1", "PATCH"],
    ["descartar", () => apiDescartarBorrador("t", "doc-1"), "/documentos/doc-1", "DELETE"],
    ["terminar", () => apiTerminarDocumento("t", "doc-1"), "/documentos/doc-1/terminar", "POST"],
    ["volver a editar", () => apiVolverAEditarDocumento("t", "doc-1"), "/documentos/doc-1/volver-a-editar", "POST"],
    ["firmar", () => apiFirmarDocumento("t", "doc-1", { rol: "profesional", trazo: { ancho: 1, alto: 1, trazos: [] } }), "/documentos/doc-1/firmas", "POST"],
  ])("%s", async (_, llamar, ruta, metodo) => {
    const fetchSpy = espiarFetch(200, {});
    await llamar();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toMatch(new RegExp(`${ruta.replace(/\//g, "\\/")}$`));
    expect(init.method ?? "GET").toBe(metodo);
    expect(init.headers.Authorization).toBe("Bearer t");
  });

  it("crear y guardar mandan su cuerpo", async () => {
    let fetchSpy = espiarFetch(201, { id: "doc-1" });
    await apiCrearDocumento("t", "plantilla", "pac-1");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ plantillaId: "plantilla", pacienteId: "pac-1" });
    fetchSpy = espiarFetch(200, {});
    await apiGuardarBorrador("t", "doc-1", { lugar: "Córdoba" });
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ valores: { lugar: "Córdoba" } });
  });

  it("un 422 trae los errores por campo", async () => {
    espiarFetch(422, { error: "Revisá los datos marcados.", errores: [{ campo: "elementos", mensaje: "Este dato es obligatorio." }] });
    await expect(apiTerminarDocumento("t", "doc-1")).resolves.toEqual({
      ok: false,
      status: 422,
      error: "Revisá los datos marcados.",
      errores: [{ campo: "elementos", mensaje: "Este dato es obligatorio." }],
    });
  });

  it("un error sin lista de errores no la inventa", async () => {
    espiarFetch(409, { error: "ya está sellado", errores: "no es una lista" });
    await expect(apiGuardarBorrador("t", "doc-1", {})).resolves.toEqual({ ok: false, status: 409, error: "ya está sellado" });
  });
});
