// Ayudantes de la pantalla de documentos clínicos (Fase 5.1).
import type { EstadoDocumento } from "@dental-mirage/shared-types";
import type { BloqueArmado, FirmaDePlantilla, ZonaCompuesta } from "@dental-mirage/documentos-clinicos";
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
  para_imprimir: "Listo para imprimir",
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

/** "2026-09-27" — el día de un instante en hora de Córdoba, para comparar
 *  contra un filtro de fechas (un `<input type="date">`). */
export function diaEnCordoba(iso?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE_CORDOBA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** "27/09/2026 · 14:05" */
export function fechaYHora(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE_CORDOBA });
  return `${fechaCorta(iso)} · ${hora}`;
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
