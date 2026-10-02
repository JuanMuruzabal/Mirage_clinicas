import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiDescargarPDFDocumentoMock, getSessionTokenMock } = vi.hoisted(() => ({
  apiDescargarPDFDocumentoMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiDescargarPDFDocumento: apiDescargarPDFDocumentoMock }));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { GET } = await import("./route");

// RouteContext es un tipo global que genera Next; alcanza con la forma que
// el handler lee (params como promesa).
const pedir = (id: string, query = "") =>
  GET(new Request(`http://localhost:3000/panel/documentos/${id}/pdf${query}`), { params: Promise.resolve({ id }) } as never);

function bytesDe(texto: string): ArrayBuffer {
  const b = new TextEncoder().encode(texto);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /panel/documentos/{id}/pdf", () => {
  it("sin sesión responde 401 y no llama a la API", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    const res = await pedir("doc-1");
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toMatch(/Iniciá sesión/);
    expect(apiDescargarPDFDocumentoMock).not.toHaveBeenCalled();
  });

  it("con la API OK pasa los bytes como PDF, con el nombre y el Cache-Control de la API", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiDescargarPDFDocumentoMock.mockResolvedValue({
      ok: true,
      datos: bytesDe("%PDF-1.4 bytes"),
      contentDisposition: 'attachment; filename="historia-clinica-folio-3.pdf"',
      cacheControl: "no-store",
    });

    const res = await pedir("doc-1");

    expect(apiDescargarPDFDocumentoMock).toHaveBeenCalledWith("tok", "doc-1", false);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("%PDF-1.4 bytes");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="historia-clinica-folio-3.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Length")).toBe(String("%PDF-1.4 bytes".length));
  });

  it("con ?para=imprimir se lo pide así a la API y devuelve el inline que contesta", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiDescargarPDFDocumentoMock.mockResolvedValue({
      ok: true,
      datos: bytesDe("%PDF-1.4"),
      contentDisposition: 'inline; filename="consentimiento-informado-extraccion-folio-4.pdf"',
      cacheControl: "no-store",
    });
    const res = await pedir("doc-4", "?para=imprimir");
    expect(apiDescargarPDFDocumentoMock).toHaveBeenCalledWith("tok", "doc-4", true);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('inline; filename="consentimiento-informado-extraccion-folio-4.pdf"');
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it.each(["?para=otra-cosa", "?para=", "?imprimir=1"])("con %s es una descarga común", async (query) => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiDescargarPDFDocumentoMock.mockResolvedValue({ ok: true, datos: bytesDe("%PDF"), contentDisposition: null, cacheControl: null });
    await pedir("doc-4", query);
    expect(apiDescargarPDFDocumentoMock).toHaveBeenCalledWith("tok", "doc-4", false);
  });

  it("sin Content-Disposition ni Cache-Control de la API: no inventa nombre y no deja cachear", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiDescargarPDFDocumentoMock.mockResolvedValue({ ok: true, datos: bytesDe("%PDF"), contentDisposition: null, cacheControl: null });
    const res = await pedir("doc-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it.each([
    [403, "Solo profesionales."],
    [404, "documento no encontrado"],
    [409, "todavía faltan firmas: el PDF está cuando el documento se sella"],
    [409, "solo un documento terminado tiene PDF"],
    [500, "no se pudo generar el PDF del documento"],
  ])("un %i de la API vuelve con su código y su mensaje, en texto plano", async (status, mensaje) => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiDescargarPDFDocumentoMock.mockResolvedValue({ ok: false, status, error: mensaje });
    const res = await pedir("doc-1");
    expect(res.status).toBe(status);
    expect(await res.text()).toBe(mensaje);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("un status 0 (sin respuesta) se vuelve 502", async () => {
    getSessionTokenMock.mockResolvedValue("tok");
    apiDescargarPDFDocumentoMock.mockResolvedValue({ ok: false, status: 0, error: "sin conexión" });
    const res = await pedir("doc-1");
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("sin conexión");
  });
});
