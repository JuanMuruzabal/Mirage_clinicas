import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { plantillaPorId } from "@dental-mirage/documentos-clinicos";
import { apiGetDocumento } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { requireProfesional } from "@/lib/documentos-servidor";
import { EditorDeDocumento } from "@/components/documentos/editor-de-documento";
import { VistaDeDocumento } from "@/components/documentos/vista-de-documento";
import { EstadoDeDocumento } from "@/components/documentos/tablas-de-documentos";

export const metadata: Metadata = { title: "Documento clínico — PRISMA" };

// /panel/documentos/[id] (Fase 5.1) — un documento. Un borrador propio se
// abre en el editor; cualquier otro estado, en la vista del documento
// congelado (las firmas, o el documento sellado). La API decide quién ve
// qué (TR-186): un borrador ajeno, o un documento de un paciente que no
// está en mi lista, es un 404.
export default async function DocumentoPage({ params, searchParams }: PageProps<"/panel/documentos/[id]">) {
  await requireProfesional();
  const { id } = await params;
  const { retomado } = await searchParams;
  const token = (await getSessionToken()) ?? "";
  const res = await apiGetDocumento(token, id);
  if (!res.ok) notFound();
  const documento = res.data;
  const plantilla = plantillaPorId(documento.plantillaId, documento.plantillaVersion);

  return (
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          <Link href="/panel/documentos" className="text-salvia-oscuro hover:text-grafito">
            ← Documentos
          </Link>
          <Link href={`/panel/pacientes/${documento.paciente.id}/documentos`} className="text-salvia-oscuro hover:text-grafito">
            Documentos de {documento.paciente.nombre}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.25rem,6vw,1.875rem)]">
            {documento.plantillaNombre}
          </h1>
          <EstadoDeDocumento estado={documento.estado} />
        </div>
        <p className="text-sm text-grafito/80">
          Para{" "}
          <Link href={`/panel/pacientes/${documento.paciente.id}`} className="font-medium text-grafito hover:underline">
            {documento.paciente.nombre} {documento.paciente.apellido}
          </Link>{" "}
          · DNI {documento.paciente.dni}
          {!documento.esMio && <> · hecho por {documento.autorNombre}</>}
        </p>
      </div>

      {documento.estado === "borrador" && documento.esMio && plantilla ? (
        <EditorDeDocumento documento={documento} plantilla={plantilla} retomado={retomado === "1"} />
      ) : (
        <VistaDeDocumento documento={documento} />
      )}
    </div>
  );
}
