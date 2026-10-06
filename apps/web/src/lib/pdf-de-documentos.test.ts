import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import {
  caminoDeDescarga,
  esAppInstalada,
  mensajeDeErrorDelPDF,
  nombreDeArchivoDelPDF,
  nombreDelContentDisposition,
  rutaDelPDF,
  type CaminoDeDescarga,
  type EntornoDeDescarga,
} from "./pdf-de-documentos";

// El PDF de un documento terminado, del lado del navegador (Fase 5.3,
// "Descargar PDF" en el celular): las funciones puras que usa
// `BotonDescargarPDF`.

describe("rutaDelPDF", () => {
  it("la ruta del BFF, con ?para=imprimir solo para imprimir", () => {
    expect(rutaDelPDF("abc")).toBe("/panel/documentos/abc/pdf");
    expect(rutaDelPDF("abc", true)).toBe("/panel/documentos/abc/pdf?para=imprimir");
  });
});

describe("nombreDeArchivoDelPDF: paridad con la API", () => {
  // La MISMA tabla que lee TestNombreDeArchivoDelPDF_Paridad en Go
  // (apps/api/internal/http/documentos_pdf_nombre_test.go): el nombre que la
  // web sugiere al "Guardar como" antes de pedir el PDF tiene que ser el que
  // después pone la API en el Content-Disposition. Un caso nuevo va en el
  // JSON, así lo prueban los dos lados.
  const tabla = JSON.parse(
    readFileSync(resolve(__dirname, "../../../api/internal/http/testdata/nombres-de-archivo-del-pdf.json"), "utf8"),
  ) as {
    casos: { caso: string; tipo: string; plantillaNombre: string; folio: number | null; anexoNumero?: number; folioHistoria?: number | null; esperado: string }[];
  };

  // El folioMostrado que manda la API (documentos.FolioDe): un anexo con su
  // número lleva el "x.y" de su historia o, sin él, "Anexo Nº y".
  const folioMostrado = (c: (typeof tabla.casos)[number]): string | undefined => {
    if (c.anexoNumero != null) return c.folioHistoria != null ? `${c.folioHistoria}.${c.anexoNumero}` : `Anexo Nº ${c.anexoNumero}`;
    return c.folio != null ? String(c.folio) : undefined;
  };

  it("la tabla tiene los casos que se piden cubrir", () => {
    const casos = tabla.casos.map((c) => c.caso);
    expect(casos).toEqual(
      expect.arrayContaining(["acentos y eñes", "consentimiento con folio", "consentimiento sin folio", "historia clínica sellada", "nombre con símbolos"]),
    );
  });

  it.each(tabla.casos.map((c) => [c.caso, c] as const))("%s", (_caso, c) => {
    const doc = {
      tipo: c.tipo,
      plantillaNombre: c.plantillaNombre,
      folioMostrado: folioMostrado(c),
      anexoNumero: c.anexoNumero,
    } as Pick<DocumentoResumen, "tipo" | "plantillaNombre" | "folioMostrado" | "anexoNumero">;
    expect(nombreDeArchivoDelPDF(doc)).toBe(c.esperado);
  });

  it("un folio null también es 'sin folio' (nunca 'folio-null')", () => {
    const doc = { tipo: "consentimiento", plantillaNombre: "Conducto", folioMostrado: null, anexoNumero: null } as unknown as Pick<
      DocumentoResumen,
      "tipo" | "plantillaNombre" | "folioMostrado" | "anexoNumero"
    >;
    expect(nombreDeArchivoDelPDF(doc)).toBe("consentimiento-informado-conducto-sin-folio.pdf");
  });
});

describe("nombreDelContentDisposition", () => {
  it.each<[string, string | null | undefined, string | null]>([
    ["filename entre comillas", 'attachment; filename="historia-clinica-folio-3.pdf"', "historia-clinica-folio-3.pdf"],
    ["filename sin comillas", "attachment; filename=consentimiento-folio-2.pdf", "consentimiento-folio-2.pdf"],
    ["sin comillas, con más parámetros después", "attachment; filename=a.pdf; size=10", "a.pdf"],
    ["comillas escapadas adentro", 'attachment; filename="el \\"bueno\\".pdf"', 'el "bueno".pdf'],
    ["inline también trae nombre", 'inline; filename="x.pdf"', "x.pdf"],
    ["mayúsculas en el parámetro", 'attachment; FILENAME="X.pdf"', "X.pdf"],
    ["filename* codificado", "attachment; filename*=UTF-8''Historia%20cl%C3%ADnica%20%C3%B1.pdf", "Historia clínica ñ.pdf"],
    [
      "filename* gana sobre filename (antes o después)",
      "attachment; filename=\"viejo.pdf\"; filename*=UTF-8''nuevo%20%C3%A1.pdf",
      "nuevo á.pdf",
    ],
    ["filename* antes de filename", "attachment; filename*=UTF-8''primero.pdf; filename=\"segundo.pdf\"", "primero.pdf"],
    ["filename* con idioma", "attachment; filename*=UTF-8'es'doc%C3%BA.pdf", "docú.pdf"],
    ["filename* entre comillas", "attachment; filename*=\"UTF-8''comillas.pdf\"", "comillas.pdf"],
    ["filename* sin charset (solo el valor)", "attachment; filename*=suelto.pdf", "suelto.pdf"],
    ["filename* mal codificado cae a filename", "attachment; filename*=UTF-8''roto%E0%A4.pdf; filename=\"bien.pdf\"", "bien.pdf"],
    ["filename* mal codificado y sin filename", "attachment; filename*=UTF-8''roto%ZZ.pdf", null],
    ["filename* vacío cae a filename", "attachment; filename*=UTF-8''; filename=\"bien.pdf\"", "bien.pdf"],
    ["header ausente (null)", null, null],
    ["header ausente (undefined)", undefined, null],
    ["header vacío", "", null],
    ["solo attachment", "attachment", null],
    ["header raro", "esto no es un header ; ; =", null],
    ["filename vacío entre comillas", 'attachment; filename=""', null],
    ["filename solo espacios", "attachment; filename=   ", null],
    ["no confunde un parámetro que termina en filename", 'attachment; xfilename="malo.pdf"', null],
    ["barra en el nombre", 'attachment; filename="../../etc/passwd.pdf"', ".._.._etc_passwd.pdf"],
    ["contrabarra en el nombre", 'attachment; filename="C:\\\\carpeta\\\\a.pdf"', "C:_carpeta_a.pdf"],
    ["barra en filename*", "attachment; filename*=UTF-8''a%2Fb%5Cc.pdf", "a_b_c.pdf"],
    ["recorta espacios", 'attachment; filename="  x.pdf  "', "x.pdf"],
  ])("%s", (_caso, header, esperado) => {
    expect(nombreDelContentDisposition(header)).toBe(esperado);
  });
});

describe("esAppInstalada", () => {
  const media = (matches: boolean) => vi.fn((consulta: string) => ({ matches: matches && consulta.length > 0 }));

  it("display-mode standalone", () => {
    const matchMedia = media(true);
    expect(esAppInstalada({ matchMedia })).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(display-mode: standalone)");
  });

  it("navigator.standalone del iPhone, aunque matchMedia diga que no", () => {
    expect(esAppInstalada({ matchMedia: media(false), navigator: { standalone: true } })).toBe(true);
  });

  it("navigator.standalone sin matchMedia", () => {
    expect(esAppInstalada({ navigator: { standalone: true } })).toBe(true);
  });

  it("ninguno de los dos: el navegador", () => {
    expect(esAppInstalada({ matchMedia: media(false), navigator: { standalone: false } })).toBe(false);
    expect(esAppInstalada({ matchMedia: media(false), navigator: {} })).toBe(false);
    expect(esAppInstalada({ matchMedia: media(false) })).toBe(false);
  });

  it("sin matchMedia ni navigator: el navegador, sin romperse", () => {
    expect(esAppInstalada({})).toBe(false);
  });

  it("solo true cuenta: un standalone que no es booleano no es la app", () => {
    expect(esAppInstalada({ navigator: { standalone: "true" as unknown as boolean } })).toBe(false);
  });
});

describe("caminoDeDescarga", () => {
  // Todas las combinaciones de los tres booleanos.
  const casos: [EntornoDeDescarga, CaminoDeDescarga][] = [];
  for (const instalada of [false, true]) {
    for (const conSelectorDeArchivo of [false, true]) {
      for (const conCompartir of [false, true]) {
        const esperado: CaminoDeDescarga = !instalada ? "descarga" : conSelectorDeArchivo ? "selector" : conCompartir ? "compartir" : "descarga";
        casos.push([{ instalada, conSelectorDeArchivo, conCompartir }, esperado]);
      }
    }
  }

  it("cubre las ocho combinaciones", () => {
    expect(casos).toHaveLength(8);
  });

  it.each(casos)("%o → %s", (entorno, esperado) => {
    expect(caminoDeDescarga(entorno)).toBe(esperado);
  });

  it("en el navegador descarga siempre, aunque haya selector y compartir", () => {
    expect(caminoDeDescarga({ instalada: false, conSelectorDeArchivo: true, conCompartir: true })).toBe("descarga");
  });

  it("instalada, el selector gana sobre compartir", () => {
    expect(caminoDeDescarga({ instalada: true, conSelectorDeArchivo: true, conCompartir: true })).toBe("selector");
  });
});

describe("mensajeDeErrorDelPDF", () => {
  it.each<[number, string, string]>([
    [409, "este documento no tiene lámina", "Este documento no tiene lámina"],
    [401, "sin sesión\n", "Sin sesión"],
    [404, "documento no encontrado", "Documento no encontrado"],
    [500, "  error   interno\n\tdel servidor  ", "Error interno del servidor"],
    [502, "", "No se pudo descargar el PDF (error 502)."],
    [503, "   \n  ", "No se pudo descargar el PDF (error 503)."],
    [500, "<!DOCTYPE html><html>…</html>", "No se pudo descargar el PDF (error 500)."],
    [413, "Ya empieza con mayúscula", "Ya empieza con mayúscula"],
  ])("%i %j", (status, texto, esperado) => {
    expect(mensajeDeErrorDelPDF(status, texto)).toBe(esperado);
  });

  it("recorta un texto largo a 200 caracteres con puntos suspensivos", () => {
    const largo = "a".repeat(500);
    const mensaje = mensajeDeErrorDelPDF(409, largo);
    expect(mensaje).toHaveLength(200);
    expect(mensaje.endsWith("…")).toBe(true);
    expect(mensaje.startsWith("A")).toBe(true);
  });

  it("uno de exactamente 200 no se recorta", () => {
    const justo = "b".repeat(200);
    expect(mensajeDeErrorDelPDF(409, justo)).toBe(`B${"b".repeat(199)}`);
  });
});
