"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DocumentoDetalle, ErrorDeCampoDeDocumento } from "@dental-mirage/shared-types";
import {
  apiCrearDocumento,
  apiDescartarBorrador,
  apiFirmarDocumento,
  apiGuardarBorrador,
  apiTerminarDocumento,
  apiRegistrarImpresionDocumento,
  type FirmaPayload,
} from "@/lib/api";
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

/** Crea el borrador y lleva al editor. */
export async function crearDocumentoAction(plantillaId: string, pacienteId: string): Promise<{ error: string }> {
  const res = await apiCrearDocumento(await token(), plantillaId, pacienteId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/panel/documentos");
  // Un solo borrador de cada documento por paciente: si ya había uno, la
  // API lo devuelve y el editor avisa que se retomó (y, si era de una
  // versión anterior del documento, que pasó a la vigente).
  const aviso = new URLSearchParams();
  if (res.data.retomado) aviso.set("retomado", "1");
  if (res.data.versionActualizada) aviso.set("actualizado", "1");
  const query = aviso.toString();
  redirect(`/panel/documentos/${res.data.id}${query ? `?${query}` : ""}`);
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
