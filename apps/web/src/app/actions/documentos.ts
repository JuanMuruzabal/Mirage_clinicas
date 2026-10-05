"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DocumentoDetalle, DocumentoResumen, ErrorDeCampoDeDocumento } from "@dental-mirage/shared-types";
import {
  apiCrearDocumento,
  apiDescartarBorrador,
  apiFirmarDocumento,
  apiGuardarBorrador,
  apiHistoriasDelPaciente,
  apiTerminarDocumento,
  apiRegistrarImpresionDocumento,
  type FirmaPayload,
} from "@/lib/api";
import { PLANTILLA_HISTORIA_GENERAL } from "@/lib/documentos";
import { getSessionToken } from "@/lib/session";

// Documentos clínicos (Fase 5.1). El cliente HTTP es server-only: estas
// acciones son la única vía desde el editor, que es un Client Component.

export type ResultadoDeDocumento =
  | { ok: true; documento: DocumentoDetalle }
  | { ok: false; error: string; errores?: ErrorDeCampoDeDocumento[] };

async function token(): Promise<string> {
  const t = await getSessionToken();
  if (!t) redirect("/ingresar");
  return t;
}

function revalidarDocumento(documento: DocumentoDetalle) {
  revalidatePath("/panel/documentos");
  revalidatePath(`/panel/documentos/${documento.id}`);
  revalidatePath(`/panel/pacientes/${documento.paciente.id}`);
}

/** Lleva al editor de un documento recién creado (o retomado). */
function irAlDocumento(documento: DocumentoDetalle): never {
  revalidatePath("/panel/documentos");
  // Un solo borrador de cada documento por paciente: si ya había uno, la
  // API lo devuelve y el editor avisa que se retomó (y, si era de una
  // versión anterior del documento, que pasó a la vigente).
  const aviso = new URLSearchParams();
  if (documento.retomado) aviso.set("retomado", "1");
  if (documento.versionActualizada) aviso.set("actualizado", "1");
  const query = aviso.toString();
  redirect(`/panel/documentos/${documento.id}${query ? `?${query}` : ""}`);
}

/** Crea el borrador y lleva al editor. `historiaId`: en un anexo, la
 *  historia clínica a la que pertenece (5.6b). */
export async function crearDocumentoAction(plantillaId: string, pacienteId: string, historiaId?: string): Promise<{ error: string }> {
  const res = await apiCrearDocumento(await token(), plantillaId, pacienteId, historiaId);
  if (!res.ok) return { error: res.error };
  irAlDocumento(res.data);
}

export type HistoriasDelPaciente = { ok: true; historias: DocumentoResumen[] } | { ok: false; error: string };

/** Las historias clínicas a las que se le puede colgar un anexo (5.6b). */
export async function historiasDelPacienteAction(pacienteId: string): Promise<HistoriasDelPaciente> {
  const res = await apiHistoriasDelPaciente(await token(), pacienteId);
  return res.ok ? { ok: true, historias: res.data } : { ok: false, error: res.error };
}

/** "Crear la Historia Clínica General" (5.6b): un anexo para un paciente
 *  que todavía no tiene historia. Crea el borrador de la General, le
 *  cuelga el anexo y abre el anexo. Si el anexo falla, la General queda en
 *  borrador: la próxima vez aparece para elegirla. */
export async function crearAnexoConHistoriaGeneralAction(plantillaId: string, pacienteId: string): Promise<{ error: string }> {
  const t = await token();
  const historia = await apiCrearDocumento(t, PLANTILLA_HISTORIA_GENERAL, pacienteId);
  if (!historia.ok) return { error: historia.error };
  const anexo = await apiCrearDocumento(t, plantillaId, pacienteId, historia.data.id);
  if (!anexo.ok) return { error: anexo.error };
  irAlDocumento(anexo.data);
}

/** El guardado automático del editor. No revalida la página: el editor es
 *  dueño de lo que la persona está escribiendo, y un refresh lo pisaría. */
export async function guardarBorradorAction(id: string, valores: Record<string, unknown>): Promise<ResultadoDeDocumento> {
  const res = await apiGuardarBorrador(await token(), id, valores);
  if (!res.ok) return { ok: false, error: res.error, errores: res.errores };
  return { ok: true, documento: res.data };
}

export async function terminarDocumentoAction(id: string): Promise<ResultadoDeDocumento> {
  const res = await apiTerminarDocumento(await token(), id);
  if (!res.ok) return { ok: false, error: res.error, errores: res.errores };
  revalidarDocumento(res.data);
  return { ok: true, documento: res.data };
}

/** La impresión la hace el navegador; esto solo la deja en la auditoría
 *  (evento "exportado"). Si falla, la impresión sigue igual. */
export async function registrarImpresionAction(id: string): Promise<void> {
  await apiRegistrarImpresionDocumento(await token(), id);
}

export async function firmarDocumentoAction(id: string, firma: FirmaPayload): Promise<ResultadoDeDocumento> {
  const res = await apiFirmarDocumento(await token(), id, firma);
  if (!res.ok) return { ok: false, error: res.error };
  revalidarDocumento(res.data);
  return { ok: true, documento: res.data };
}

/** Descarta un borrador y vuelve al módulo. */
export async function descartarBorradorAction(id: string): Promise<{ error: string }> {
  const res = await apiDescartarBorrador(await token(), id);
  if (!res.ok) return { error: res.error };
  revalidatePath("/panel/documentos");
  redirect("/panel/documentos");
}
