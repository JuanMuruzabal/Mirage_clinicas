import { afterEach, describe, expect, it, vi } from "vitest";
import { apiCrearDocumento, apiHistoriasDelPaciente } from "./api";

function espiarFetch(status: number, body: unknown) {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => vi.unstubAllGlobals());

describe("lib/api — el vínculo anexo ↔ historia (5.6b)", () => {
  it("las historias de un paciente: GET con el paciente en la query, codificado", async () => {
    const fetchSpy = espiarFetch(200, [{ id: "h1" }]);
    const res = await apiHistoriasDelPaciente("t", "pac 1&x");
    expect(res).toEqual({ ok: true, data: [{ id: "h1" }] });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/documentos\/historias\?paciente=pac%201%26x$/);
    expect(init.method ?? "GET").toBe("GET");
  });

  it("crear manda la historia en el body; sin ella no viaja", async () => {
    let fetchSpy = espiarFetch(201, { id: "a1" });
    await apiCrearDocumento("t", "anexo-de-prueba", "pac-1", "h1");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ plantillaId: "anexo-de-prueba", pacienteId: "pac-1", historiaId: "h1" });

    fetchSpy = espiarFetch(201, { id: "c1" });
    await apiCrearDocumento("t", "consentimiento-tratamiento-conducto", "pac-1");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ plantillaId: "consentimiento-tratamiento-conducto", pacienteId: "pac-1" });
  });
});
