import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentoVinculado } from "@dental-mirage/shared-types";
import { apiCrearContinuacion, apiSumarAsiento } from "./api";
import { anexosPorSeccion, estadoEnTabla, fechaDelDocumento, nombreDelDocumento, referenciaDeVinculo } from "./documentos";

// Los anexos de continuación (5.6d) en las tablas y en lib/api.

describe("lib/documentos — anexos de continuación", () => {
  it("la fecha de un anexo abierto es la de su último asiento; sin asientos, la de siempre", () => {
    const fechas = { selladoEn: undefined, terminadoEn: "2026-10-05T10:00:00-03:00", actualizadoEn: "2026-10-05T09:00:00-03:00" };
    expect(fechaDelDocumento({ ...fechas, ultimoAsientoEn: "2026-10-06T11:30:00-03:00" })).toBe("2026-10-06T11:30:00-03:00");
    expect(fechaDelDocumento({ ...fechas, ultimoAsientoEn: undefined })).toBe("2026-10-05T10:00:00-03:00");
  });

  it("el estado abierto se nombra Abierto, no Completado, y no le falta firmar", () => {
    expect(estadoEnTabla("abierto")).toMatchObject({ etiqueta: "Abierto", faltaFirmar: false });
    expect(estadoEnTabla("abierto").chip).not.toBe(estadoEnTabla("sellado").chip);
    expect(estadoEnTabla("a_firmar")).toMatchObject({ etiqueta: "Completado", faltaFirmar: true });
  });

  it("un anexo de continuación se nombra por su número y su sección; lo demás, con su tipo", () => {
    expect(nombreDelDocumento({ tipo: "anexo", plantillaNombre: "Anexo de continuación", continuacion: { seccion: "estudios", numero: 4 } })).toBe(
      "Anexo Nº 4 · Estudios complementarios",
    );
    expect(nombreDelDocumento({ tipo: "anexo", plantillaNombre: "Anexo de odontopediatría" })).toBe("Anexo de odontopediatría");
    expect(nombreDelDocumento({ tipo: "historia_clinica", plantillaNombre: "General" })).toBe("Historia clínica: General");
  });

  it("anexosPorSeccion junta solo los de continuación, por sección", () => {
    const vinculo = (id: string, extra: Partial<DocumentoVinculado>) => ({ id, estado: "abierto", ...extra }) as DocumentoVinculado;
    expect(
      anexosPorSeccion([
        vinculo("c1", { continuacion: { seccion: "plan", numero: 1 } }),
        vinculo("a1", { estado: "sellado" }),
        vinculo("c2", { continuacion: { seccion: "diagnostico", numero: 2 } }),
      ]),
    ).toEqual({ plan: { id: "c1", numero: 1 }, diagnostico: { id: "c2", numero: 2 } });
    expect(anexosPorSeccion()).toEqual({});
  });

  it("un anexo abierto sin folio se señala como Abierto; con el de su historia, por su x.y", () => {
    expect(referenciaDeVinculo({ id: "c1", estado: "abierto" } as DocumentoVinculado)).toBe("Abierto");
    expect(referenciaDeVinculo({ id: "c1", estado: "abierto", folioMostrado: "Anexo Nº 1" } as DocumentoVinculado)).toBe("Abierto");
    expect(referenciaDeVinculo({ id: "c1", estado: "abierto", folioMostrado: "3.1" } as DocumentoVinculado)).toBe("folio 3.1");
  });
});

function espiarFetch(status: number, body: unknown) {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => vi.unstubAllGlobals());

describe("lib/api — anexos de continuación", () => {
  it("crear la continuación: POST con la sección, el id codificado", async () => {
    const fetchSpy = espiarFetch(201, { id: "c1" });
    await expect(apiCrearContinuacion("t", "h 1/x", "plan")).resolves.toEqual({ ok: true, data: { id: "c1" } });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/documentos\/h%201%2Fx\/continuaciones$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ seccion: "plan" });
  });

  it("una anotación: POST solo con el texto, sin firma; un 409 vuelve con su error", async () => {
    let fetchSpy = espiarFetch(201, { id: "c1" });
    await apiSumarAsiento("t", "c1", "Control.");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/documentos\/c1\/asientos$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ texto: "Control." });

    fetchSpy = espiarFetch(409, { error: "solo un anexo de continuación suma anotaciones" });
    const res = await apiSumarAsiento("t", "h1", "Control.");
    expect(res).toMatchObject({ ok: false, status: 409, error: "solo un anexo de continuación suma anotaciones" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
