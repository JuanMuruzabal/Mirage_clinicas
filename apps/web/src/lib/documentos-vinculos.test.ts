import { describe, expect, it } from "vitest";
import type { DocumentoResumen, DocumentoVinculado } from "@dental-mirage/shared-types";
import {
  CHIP_DE_ESTADO,
  estadoEnTabla,
  fechaDelDocumento,
  fechaYHora,
  filasDeHistorias,
  partesFechaHoraDeDocumento,
  referenciaDeVinculo,
} from "./documentos";

// Los ayudantes de la 5.6b, ronda A: el estado y la fecha de las tablas, y
// las filas de la tabla de historias con sus anexos.

function doc(extra: Partial<DocumentoResumen>): DocumentoResumen {
  return {
    id: "x",
    plantillaId: "historia-clinica-general",
    plantillaVersion: 1,
    plantillaNombre: "Historia clínica general",
    tipo: "historia_clinica",
    estado: "borrador",
    paciente: { id: "pac-1", nombre: "Ana", apellido: "Paz" },
    autorUserId: "u1",
    autorNombre: "Lucía Gómez",
    esMio: true,
    creadoEn: "2026-09-01T10:00:00-03:00",
    actualizadoEn: "2026-09-02T10:00:00-03:00",
    tienePDF: false,
    anexoDe: null,
    ...extra,
  } as DocumentoResumen;
}

const vinculo = (extra: Partial<DocumentoVinculado> = {}): DocumentoVinculado => ({
  id: "h1",
  nombre: "Historia clínica general",
  estado: "sellado",
  folio: 3,
  folioMostrado: "3",
  fecha: "2026-09-27T14:05:00-03:00",
  ...extra,
});

describe("estadoEnTabla", () => {
  it("Borrador y Anulado se nombran como siempre", () => {
    expect(estadoEnTabla("borrador")).toEqual({ etiqueta: "Borrador", chip: CHIP_DE_ESTADO.borrador, faltaFirmar: false });
    expect(estadoEnTabla("anulado")).toMatchObject({ chip: CHIP_DE_ESTADO.anulado, faltaFirmar: false });
    expect(estadoEnTabla("anulado").etiqueta).toMatch(/^Anulad/);
  });

  it("a firmar, para imprimir y sellado son Completado, con el chip del sellado; solo a firmar marca la firma que falta", () => {
    for (const estado of ["a_firmar", "para_imprimir", "sellado"] as const) {
      const e = estadoEnTabla(estado);
      expect(e.etiqueta).toBe("Completado");
      expect(e.chip).toBe(CHIP_DE_ESTADO.sellado);
      expect(e.faltaFirmar).toBe(estado === "a_firmar");
    }
  });
});

describe("fechaDelDocumento", () => {
  it("sellado, si no terminado, si no la última modificación", () => {
    const actualizadoEn = "2026-09-01T10:00:00-03:00";
    const terminadoEn = "2026-09-02T10:00:00-03:00";
    const selladoEn = "2026-09-03T10:00:00-03:00";
    expect(fechaDelDocumento({ actualizadoEn, terminadoEn, selladoEn })).toBe(selladoEn);
    expect(fechaDelDocumento({ actualizadoEn, terminadoEn })).toBe(terminadoEn);
    expect(fechaDelDocumento({ actualizadoEn })).toBe(actualizadoEn);
  });
});

describe("la fecha con hora de las tablas", () => {
  it("en hora de Córdoba, separada para la celda y junta para el texto", () => {
    expect(partesFechaHoraDeDocumento("2026-09-27T17:05:00Z")).toEqual({ fecha: "27/09/2026", hora: "14:05" });
    expect(fechaYHora("2026-09-27T17:05:00Z")).toBe("27/09/2026 · 14:05");
    // Pasada la medianoche UTC, sigue siendo el día anterior en Córdoba.
    expect(partesFechaHoraDeDocumento("2026-09-28T01:30:00Z")).toEqual({ fecha: "27/09/2026", hora: "22:30" });
  });

  it("sin fecha, nada", () => {
    expect(partesFechaHoraDeDocumento(undefined)).toBeNull();
    expect(partesFechaHoraDeDocumento("")).toBeNull();
    expect(fechaYHora(undefined)).toBe("—");
  });
});

describe("referenciaDeVinculo", () => {
  it("con folio, el folio; sin folio, el estado (y la firma que falta)", () => {
    expect(referenciaDeVinculo(vinculo())).toBe("folio 3");
    expect(referenciaDeVinculo(vinculo({ folio: undefined, folioMostrado: "3.1" }))).toBe("folio 3.1");
    expect(referenciaDeVinculo(vinculo({ folio: undefined, folioMostrado: undefined, estado: "borrador" }))).toBe("Borrador");
    expect(referenciaDeVinculo(vinculo({ folio: undefined, folioMostrado: undefined, estado: "a_firmar" }))).toBe("Completado, falta firmar");
    // Un anexo cuya historia todavía no tiene folio: su estado.
    expect(referenciaDeVinculo(vinculo({ folio: undefined, folioMostrado: "Anexo Nº 1", estado: "sellado" }))).toBe("Completado");
  });
});

describe("filasDeHistorias", () => {
  const h1 = doc({ id: "h1" });
  const h2 = doc({ id: "h2", plantillaId: "historia-clinica-pcd", plantillaNombre: "Historia clínica PcD" });
  const anexo = (id: string, extra: Partial<DocumentoResumen> = {}) =>
    doc({ id, tipo: "anexo", plantillaId: "anexo-de-prueba", plantillaNombre: "Prueba", ...extra });

  it("cada historia con sus anexos debajo, en el orden en que vinieron", () => {
    const filas = filasDeHistorias([
      anexo("a2", { anexoDe: vinculo({ id: "h2" }) }),
      h1,
      anexo("a1b", { anexoDe: vinculo({ id: "h1" }) }),
      h2,
      anexo("a1a", { anexoDe: vinculo({ id: "h1" }) }),
    ]);
    expect(filas.map((f) => [f.documento.id, f.nivel])).toEqual([
      ["h1", "documento"],
      ["a1b", "anexo"],
      ["a1a", "anexo"],
      ["h2", "documento"],
      ["a2", "anexo"],
    ]);
  });

  it("al final, primero los anexos de una historia oculta y después los sueltos, cada grupo en su orden", () => {
    const filas = filasDeHistorias([
      anexo("suelto-1"),
      anexo("oculta-1", { historiaNoVisible: true }),
      h1,
      // Su historia no está en la lista (la filtraron): suelto, aunque la conozca.
      anexo("suelto-2", { anexoDe: vinculo({ id: "h-filtrada" }) }),
      anexo("oculta-2", { historiaNoVisible: true }),
    ]);
    expect(filas.map((f) => [f.documento.id, f.nivel])).toEqual([
      ["h1", "documento"],
      ["oculta-1", "anexo-de-historia-oculta"],
      ["oculta-2", "anexo-de-historia-oculta"],
      ["suelto-1", "anexo-suelto"],
      ["suelto-2", "anexo-suelto"],
    ]);
  });

  it("no pierde ni repite filas, y sin anexos deja todo como documento", () => {
    expect(filasDeHistorias([])).toEqual([]);
    const solas = filasDeHistorias([h1, h2]);
    expect(solas.map((f) => f.nivel)).toEqual(["documento", "documento"]);
    const mezcla = [h1, anexo("a", { anexoDe: vinculo() }), anexo("b"), h2];
    expect(filasDeHistorias(mezcla).map((f) => f.documento.id).sort()).toEqual(mezcla.map((d) => d.id).sort());
  });
});
