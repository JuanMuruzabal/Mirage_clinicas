// Ayudantes de la pantalla de documentos clínicos (Fase 5.1).
import type { DocumentoResumen, DocumentoVinculado, EstadoDocumento } from "@dental-mirage/shared-types";
import {
  ETIQUETA_DE_TIPO,
  type BloqueArmado,
  type Figura,
  type FirmaDePlantilla,
  type TipoDePlantilla,
  type ZonaCompuesta,
} from "@dental-mirage/documentos-clinicos";
import { TIMEZONE_CORDOBA } from "./turno-format";

/** El documento congelado al terminar — espejo de ContenidoCongelado de
 *  apps/api/internal/documentos/sello.go. Es lo que se firma: desde "a
 *  firmar", la pantalla lee ESTO, no vuelve a armar el texto. */
export interface ContenidoCongelado {
  formato: number;
  documentoId: string;
  plantilla: { id: string; version: number; nombre: string; tipo: string; fuente: { nombre: string; url: string } };
  clinica: { id: string; nombre: string };
  paciente: { id: string; nombre: string; apellido: string; dni: string };
  profesional: { userId: string; nombre: string; apellido: string; matriculaTipo: string; matriculaNumero: string };
  fecha: string;
  terminadoEn: string;
  valores: Record<string, unknown>;
  cuerpo: BloqueArmado[];
  firmas: FirmaDePlantilla[];
  /** Lo cargado ya compuesto sobre la página original (TR-187): es lo que
   *  se dibuja, tal cual lo congeló la API. Falta en una plantilla sin
   *  lámina (entonces se lee `cuerpo` en el calco). */
  lamina?: ZonaCompuesta[];
  /** Lo dibujado en el odontograma, tal cual lo congeló la API (Fase 5.5).
   *  Falta en un documento sin odontograma. */
  figuras?: Figura[];
}

/** Lee el contenido congelado que manda la API, o null si no tiene la
 *  forma esperada (una respuesta vieja o rota no rompe la pantalla). */
export function contenidoCongelado(valor: unknown): ContenidoCongelado | null {
  if (typeof valor !== "object" || valor === null) return null;
  const c = valor as Partial<ContenidoCongelado>;
  if (!Array.isArray(c.cuerpo) || !Array.isArray(c.firmas) || !c.paciente || !c.plantilla) return null;
  return c as ContenidoCongelado;
}

export const ETIQUETA_DE_ESTADO: Record<EstadoDocumento, string> = {
  borrador: "Borrador",
  a_firmar: "Esperando firmas",
  para_imprimir: "Listo para imprimir o descargar",
  sellado: "Firmado y sellado",
  anulado: "Anulado",
};

/** Las clases del chip de cada estado: el sellado en verde (listo), lo
 *  que falta en acero, lo anulado apagado. */
export const CHIP_DE_ESTADO: Record<EstadoDocumento, string> = {
  borrador: "bg-hueso text-grafito/75 border-linea",
  a_firmar: "bg-acero-claro text-acero-oscuro border-acero/30",
  para_imprimir: "bg-salvia-claro text-salvia-oscuro border-salvia/40",
  sellado: "bg-salvia-claro text-salvia-oscuro border-salvia/40",
  anulado: "bg-arena text-grafito/70 border-linea",
};

/** "27/09/2026" — la fecha de un instante, en hora de Córdoba. */
export function fechaCorta(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TIMEZONE_CORDOBA,
  });
}

/** "Consentimiento informado: Tratamiento de conducto" — el documento con
 *  su tipo adelante, como se nombra en las tablas (pedido del cliente,
 *  2026-09-29): el nombre solo no dice si es un consentimiento o una
 *  historia clínica. Si el nombre ya empieza con su tipo ("Historia clínica
 *  general"), no se repite. */
export function nombreConTipo(d: Pick<DocumentoResumen, "tipo" | "plantillaNombre">): string {
  const tipo = ETIQUETA_DE_TIPO[d.tipo as TipoDePlantilla];
  if (!tipo || empiezaCon(d.plantillaNombre, tipo)) return d.plantillaNombre;
  return `${tipo}: ${d.plantillaNombre}`;
}

// Sin mayúsculas ni acentos y por palabras enteras: "Historia clínica
// general" ya dice su tipo, "Anexos" no empieza con "Anexo". Espejo de
// `NombreSinRepetirTipo` de la API (internal/documentos/pdf.go), que arma el
// nombre del archivo del PDF.
function empiezaCon(nombre: string, etiqueta: string): boolean {
  const plegar = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const n = plegar(nombre);
  const e = plegar(etiqueta);
  return n === e || n.startsWith(`${e} `);
}

/** "2026-09-27" — el día de un instante en hora de Córdoba, para comparar
 *  contra un filtro de fechas (un `<input type="date">`). */
export function diaEnCordoba(iso?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE_CORDOBA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** "27/09/2026" y "14:05" por separado, en hora de Córdoba: para
 *  `FechaHoraCelda`, que en el celular los pone en dos renglones. */
export function partesFechaHoraDeDocumento(iso?: string): { fecha: string; hora: string } | null {
  if (!iso) return null;
  const hora = new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE_CORDOBA });
  return { fecha: fechaCorta(iso), hora };
}

/** "27/09/2026 · 14:05" */
export function fechaYHora(iso?: string): string {
  const partes = partesFechaHoraDeDocumento(iso);
  return partes ? `${partes.fecha} · ${partes.hora}` : "—";
}

/** El instante que muestran las tablas de documentos (2026-10-05): cuándo se
 *  completó —sellado o terminado— y, en un borrador, su última modificación. */
export function fechaDelDocumento(d: Pick<DocumentoResumen, "selladoEn" | "terminadoEn" | "actualizadoEn">): string {
  return d.selladoEn ?? d.terminadoEn ?? d.actualizadoEn;
}

/** El estado como se nombra en las tablas (2026-10-05): Borrador o
 *  Completado —un "a firmar" ya está completo, y le falta firmar— y
 *  Anulado. El detalle ("Esperando firmas", "Firmado y sellado") queda para
 *  el encabezado del documento. */
export function estadoEnTabla(estado: EstadoDocumento): { etiqueta: string; chip: string; faltaFirmar: boolean } {
  if (estado === "borrador" || estado === "anulado") {
    return { etiqueta: ETIQUETA_DE_ESTADO[estado], chip: CHIP_DE_ESTADO[estado], faltaFirmar: false };
  }
  return { etiqueta: "Completado", chip: CHIP_DE_ESTADO.sellado, faltaFirmar: estado === "a_firmar" };
}

/** Cómo se señala el otro lado de un vínculo anexo ↔ historia: su folio,
 *  si ya lo tiene, o su estado. */
export function referenciaDeVinculo(v: DocumentoVinculado): string {
  if (v.folio != null) return `folio ${v.folio}`;
  const { etiqueta, faltaFirmar } = estadoEnTabla(v.estado);
  return faltaFirmar ? `${etiqueta}, falta firmar` : etiqueta;
}

/** La historia clínica que se ofrece crear cuando a un paciente sin
 *  ninguna se le hace un anexo (5.6b). */
export const PLANTILLA_HISTORIA_GENERAL = "historia-clinica-general";

export type FilaDeHistorias = {
  documento: DocumentoResumen;
  /** `anexo`: va debajo de su historia, que es la fila de arriba.
   *  `anexo-de-historia-oculta`: su historia es de otro profesional, que
   *  todavía no la terminó (quien mira no la ve).
   *  `anexo-suelto`: su historia no está en la lista (la filtraron) o no
   *  tiene. */
  nivel: "documento" | "anexo" | "anexo-de-historia-oculta" | "anexo-suelto";
};

/** Las filas de la tabla de historias clínicas de un paciente (5.6b): cada
 *  historia con sus anexos debajo, en el orden en que vinieron; al final,
 *  los anexos de una historia que quien mira no ve, y después los que no
 *  tienen la suya en la lista. */
export function filasDeHistorias(documentos: DocumentoResumen[]): FilaDeHistorias[] {
  const enLaLista = new Set(documentos.map((d) => d.id));
  const anexosDe = new Map<string, DocumentoResumen[]>();
  const deHistoriaOculta: FilaDeHistorias[] = [];
  const sueltos: FilaDeHistorias[] = [];
  for (const d of documentos) {
    if (d.tipo !== "anexo") continue;
    const historia = d.anexoDe?.id;
    if (historia && enLaLista.has(historia)) anexosDe.set(historia, [...(anexosDe.get(historia) ?? []), d]);
    else if (d.historiaNoVisible) deHistoriaOculta.push({ documento: d, nivel: "anexo-de-historia-oculta" });
    else sueltos.push({ documento: d, nivel: "anexo-suelto" });
  }
  const filas: FilaDeHistorias[] = [];
  for (const d of documentos) {
    if (d.tipo === "anexo") continue;
    filas.push({ documento: d, nivel: "documento" });
    for (const anexo of anexosDe.get(d.id) ?? []) filas.push({ documento: anexo, nivel: "anexo" });
  }
  return [...filas, ...deHistoriaOculta, ...sueltos];
}

/** Una huella SHA-256 abreviada para mostrar: "a3f1c0de…0000". La
 *  completa va en el title y en la constancia. */
export function huellaCorta(hash?: string): string {
  if (!hash) return "—";
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}

/** El nombre de un rol de firma, para cuando la plantilla no está a mano. */
export const ETIQUETA_DE_ROL: Record<string, string> = {
  paciente: "Paciente o representante",
  representante: "Representante legal",
  asentimiento: "Asentimiento del paciente",
  profesional: "Profesional",
  otro_profesional: "Otro profesional",
  testigo_1: "Testigo",
  testigo_2: "Segundo testigo",
};
