import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { nombreConTipo } from "@/lib/documentos";

// El PDF de un documento terminado (Fase 5.3), del lado del navegador: la
// ruta del BFF que lo sirve, el nombre del archivo y cómo se guarda según
// dónde corre la página. Todo puro, para poder probarlo sin un navegador;
// lo usa `BotonDescargarPDF` (components/documentos/descargar-pdf.tsx).

export function rutaDelPDF(id: string, paraImprimir = false): string {
  return `/panel/documentos/${id}/pdf${paraImprimir ? "?para=imprimir" : ""}`;
}

// Las mismas letras que reemplaza `sinAcentos` en la API
// (internal/http/documentos_pdf.go): el nombre sugerido antes de bajar el
// archivo tiene que ser el mismo que después pone la API.
const SIN_ACENTOS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ü: "u", Ñ: "n",
};

/** "consentimiento-informado-tratamiento-de-conducto-folio-3.pdf": el
 *  calco de `nombreDeArchivoDelPDF` de la API —el documento con su tipo, en
 *  ASCII, sin datos del paciente—. Hace falta ANTES de pedir el PDF: el
 *  selector de "Guardar como" de la app instalada se abre dentro del clic,
 *  antes de que llegue la respuesta con su Content-Disposition. */
export function nombreDeArchivoDelPDF(d: Pick<DocumentoResumen, "tipo" | "plantillaNombre" | "folio">): string {
  const sinAcentos = [...nombreConTipo(d)].map((c) => SIN_ACENTOS[c] ?? c).join("");
  const base = sinAcentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "documento"}${d.folio == null ? "-sin-folio" : `-folio-${d.folio}`}.pdf`;
}

/** El nombre del archivo de un header Content-Disposition: `filename*=`
 *  (RFC 5987, `UTF-8''nombre%20codificado`) si viene, si no `filename=`
 *  (entre comillas o suelto). Sin separadores de carpeta: es un nombre, no
 *  una ruta. Null si no trae ninguno. */
export function nombreDelContentDisposition(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const extendido = /filename\*\s*=\s*([^;]*)/i.exec(valor);
  if (extendido) {
    const crudo = extendido[1].trim().replace(/^"(.*)"$/, "$1");
    const partes = /^[^']*'[^']*'(.*)$/.exec(crudo);
    try {
      const nombre = decodeURIComponent(partes ? partes[1] : crudo);
      if (nombre.trim()) return limpiarNombre(nombre);
    } catch {
      // Mal codificado: se prueba con el `filename=` común.
    }
  }
  const comun = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]*))/i.exec(valor);
  if (!comun) return null;
  const nombre = comun[1] !== undefined ? comun[1].replace(/\\(.)/g, "$1") : comun[2].trim();
  return nombre.trim() ? limpiarNombre(nombre) : null;
}

function limpiarNombre(nombre: string): string {
  return nombre.trim().replace(/[\\/]/g, "_");
}

/** Lo que el componente necesita saber del navegador para elegir cómo
 *  guardar el archivo. */
export interface EntornoDeDescarga {
  /** Corre como app instalada (en la pantalla de inicio): `display-mode:
   *  standalone`, o `navigator.standalone` en el iPhone. */
  instalada: boolean;
  /** Existe `window.showSaveFilePicker` (Chrome y Edge de escritorio). */
  conSelectorDeArchivo: boolean;
  /** Existen `navigator.share` y `navigator.canShare` (el iPhone, Android). */
  conCompartir: boolean;
}

/** Por dónde se guarda el PDF:
 *  - "selector": app instalada con "Guardar como" del sistema; se abre
 *    primero, dentro del clic, y el PDF se escribe ahí.
 *  - "compartir": app instalada sin selector; la hoja de compartir del
 *    sistema, que en el iPhone ofrece "Guardar en Archivos" (pregunta la
 *    carpeta). Si el navegador no puede compartir ESE archivo, descarga.
 *  - "descarga": el navegador; un link de descarga sobre el archivo ya
 *    bajado, que dispara la descarga de siempre.
 *  En la app instalada del iPhone, una descarga común abre una vista previa
 *  sin salida: por eso ahí se prefiere compartir. */
export type CaminoDeDescarga = "selector" | "compartir" | "descarga";

export function caminoDeDescarga(entorno: EntornoDeDescarga): CaminoDeDescarga {
  if (!entorno.instalada) return "descarga";
  if (entorno.conSelectorDeArchivo) return "selector";
  if (entorno.conCompartir) return "compartir";
  return "descarga";
}

/** Lo mínimo de `window` que mira `esAppInstalada`: así se prueba con un
 *  objeto, sin tocar el `window` de jsdom. */
export interface VentanaParaDetectar {
  matchMedia?: (consulta: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
}

export function esAppInstalada(ventana: VentanaParaDetectar): boolean {
  const standalone = typeof ventana.matchMedia === "function" && ventana.matchMedia("(display-mode: standalone)").matches;
  return standalone || ventana.navigator?.standalone === true;
}

/** El mensaje de un error de la ruta del PDF, que vuelve en texto plano
 *  (el 409 de un documento sin lámina, el 401 sin sesión…). Recortado: va
 *  en un aviso chico al lado del botón. */
export function mensajeDeErrorDelPDF(status: number, texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (!limpio || limpio.startsWith("<")) return `No se pudo descargar el PDF (error ${status}).`;
  const recortado = limpio.length > 200 ? `${limpio.slice(0, 199)}…` : limpio;
  return recortado.charAt(0).toUpperCase() + recortado.slice(1);
}
