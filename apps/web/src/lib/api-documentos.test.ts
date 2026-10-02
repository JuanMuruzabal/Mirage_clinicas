import { afterEach, describe, expect, it, vi } from "vitest";
import {
  apiCrearDocumento,
  apiDescargarPDFDocumento,
  apiDescartarBorrador,
  apiDocumentosDePaciente,
  apiDocumentosEnCurso,
  apiFirmarDocumento,
  apiGetDocumento,
  apiGuardarBorrador,
  apiPacientesConDocumentos,
  apiTerminarDocumento,
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

describe("lib/api — apiDescargarPDFDocumento (Fase 5.3)", () => {
  function respuestaPDF(status: number, opciones: { bytes?: Uint8Array; headers?: Record<string, string>; json?: () => Promise<unknown> } = {}) {
    const bytes = opciones.bytes ?? new Uint8Array();
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(opciones.headers ?? {}),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      json: opciones.json ?? (async () => ({})),
    } as unknown as Response;
  }

  it("pide el PDF con la sesión, sin caché, y devuelve los bytes con los headers de la API", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 algo");
    const fetchSpy = vi.fn().mockResolvedValue(
      respuestaPDF(200, {
        bytes,
        headers: { "Content-Disposition": 'attachment; filename="historia-folio-3.pdf"', "Cache-Control": "no-store" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await apiDescargarPDFDocumento("t", "doc 1/x");

    const [url, init] = fetchSpy.mock.calls[0];
    // El id va codificado: no puede salirse de su segmento de la ruta.
    expect(url).toMatch(/\/documentos\/doc%201%2Fx\/pdf$/);
    expect(init.method ?? "GET").toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer t");
    expect(init.cache).toBe("no-store");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(new TextDecoder().decode(res.datos)).toBe("%PDF-1.4 algo");
    expect(res.contentDisposition).toBe('attachment; filename="historia-folio-3.pdf"');
    expect(res.cacheControl).toBe("no-store");
  });

  it("con paraImprimir lo pide con ?para=imprimir y devuelve el inline de la API; sin eso, sin query", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      respuestaPDF(200, { headers: { "Content-Disposition": 'inline; filename="x-folio-1.pdf"' } }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await apiDescargarPDFDocumento("t", "doc-1", true);
    expect(fetchSpy.mock.calls[0][0]).toMatch(/\/documentos\/doc-1\/pdf\?para=imprimir$/);
    expect(res).toMatchObject({ ok: true, contentDisposition: 'inline; filename="x-folio-1.pdf"' });

    await apiDescargarPDFDocumento("t", "doc-1", false);
    expect(fetchSpy.mock.calls[1][0]).toMatch(/\/documentos\/doc-1\/pdf$/);
  });

  it("sin headers en la respuesta, los devuelve en null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuestaPDF(200)));
    const res = await apiDescargarPDFDocumento("t", "doc-1");
    expect(res).toMatchObject({ ok: true, contentDisposition: null, cacheControl: null });
  });

  it.each([404, 409, 503, 500])("un %i de la API vuelve con su código y su mensaje", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuestaPDF(status, { json: async () => ({ error: `mensaje ${status}` }) })));
    await expect(apiDescargarPDFDocumento("t", "doc-1")).resolves.toEqual({ ok: false, status, error: `mensaje ${status}` });
  });

  it("un error sin cuerpo JSON usa un mensaje genérico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respuestaPDF(502, {
          json: async () => {
            throw new SyntaxError("no es JSON");
          },
        }),
      ),
    );
    await expect(apiDescargarPDFDocumento("t", "doc-1")).resolves.toEqual({ ok: false, status: 502, error: "No se pudo descargar el PDF." });
  });

  it("un cuerpo JSON que no es un error tampoco se inventa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuestaPDF(409, { json: async () => ({ otra: "cosa" }) })));
    await expect(apiDescargarPDFDocumento("t", "doc-1")).resolves.toEqual({ ok: false, status: 409, error: "No se pudo descargar el PDF." });
  });

  it("sin conexión con la API, 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(apiDescargarPDFDocumento("t", "doc-1")).resolves.toMatchObject({ ok: false, status: 502 });
  });
});
