import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { DocumentoDetalle } from "@dental-mirage/shared-types";
import { continuacionesDe, plantillaPorId, type Plantilla } from "@dental-mirage/documentos-clinicos";
import { apiGetDocumento } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { requireProfesional } from "@/lib/documentos-servidor";
import { esAnexoSinFolio, nombreDeModelo, nombreDelDocumento, rotuloDeFolio } from "@/lib/documentos";
import { AnexoDeContinuacion } from "@/components/documentos/anexo-de-continuacion";
import { AccionesDePDF, nombreDeArchivoDelPDF, tienePDF } from "@/components/documentos/acciones-de-pdf";
import { EditorDeDocumento } from "@/components/documentos/editor-de-documento";
import { VistaDeDocumento } from "@/components/documentos/vista-de-documento";
import { EstadoDeDocumento } from "@/components/documentos/tablas-de-documentos";
import { MigaDelDocumento, VinculosDelDocumento } from "@/components/documentos/vinculos-del-documento";

export const metadata: Metadata = { title: "Documento clínico — PRISMA" };

/** Las secciones de una historia completada que continúan en un anexo (Fase
 *  5.6d): se crean y se abren desde su encabezado. En un borrador, eso va
 *  junto a cada campo del editor; una anulada ya no suma anexos. */
function continuacionesDeLaVista(documento: DocumentoDetalle, plantilla: Plantilla | undefined) {
  if (!plantilla || documento.tipo !== "historia_clinica" || documento.estado === "borrador" || documento.estado === "anulado") return undefined;
  return { historiaId: documento.id, secciones: continuacionesDe(plantilla).map((c) => c.seccion) };
}

// /panel/documentos/[id] (Fase 5.1) — un documento. Un borrador propio se
// abre en el editor; un anexo de continuación, con sus asientos (Fase 5.6d);
// cualquier otro estado, en la vista del documento congelado (las firmas, o
// el documento sellado). La API decide quién ve
// qué (TR-186): un borrador ajeno, o un documento de un paciente que no
// está en mi lista, es un 404.
export default async function DocumentoPage({ params, searchParams }: PageProps<"/panel/documentos/[id]">) {
  await requireProfesional();
  const { id } = await params;
  const { retomado, actualizado } = await searchParams;
  const token = (await getSessionToken()) ?? "";
  const res = await apiGetDocumento(token, id);
  if (!res.ok) notFound();
  const documento = res.data;
  // Mi borrador era de una versión anterior del documento: la API lo pasó a
  // la vigente, que es un documento nuevo (TR-189, addendum).
  if (documento.id !== id) {
    redirect(`/panel/documentos/${documento.id}${documento.versionActualizada ? "?actualizado=1" : ""}`);
  }
  const plantilla = plantillaPorId(documento.plantillaId, documento.plantillaVersion);
  // Un borrador propio se abre en el editor, que pone cada anexo de
  // continuación junto a su campo.
  const enElEditor = !documento.continuacion && documento.estado === "borrador" && documento.esMio && !!plantilla;
  // El folio ("Folio 3", el "Folio 3.1" de un anexo); un anexo de
  // continuación sin él ya dice su número en el título.
  const { folioMostrado } = documento;
  const titulo = documento.continuacion ? nombreDelDocumento(documento) : nombreDeModelo(documento.plantillaNombre);
  const folio = folioMostrado && !(documento.continuacion && esAnexoSinFolio(folioMostrado)) ? rotuloDeFolio(folioMostrado) : undefined;

  return (
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <div className="flex flex-col gap-3">
        <MigaDelDocumento documento={documento} titulo={titulo} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.5rem,7vw,1.875rem)]">
            {titulo}
          </h1>
          <EstadoDeDocumento estado={documento.estado} />
        </div>
        <p className="text-[15px] text-grafito/80">
          Paciente:{" "}
          <Link href={`/panel/pacientes/${documento.paciente.id}`} className="font-semibold text-grafito underline-offset-2 hover:underline">
            {documento.paciente.nombre} {documento.paciente.apellido}
          </Link>{" "}
          · DNI {documento.paciente.dni}
          {folio && <> · {folio}</>}
          {!documento.esMio && <> · hecho por {documento.autorNombre}</>}
        </p>
        <VinculosDelDocumento
          documento={documento}
          continuaciones={continuacionesDeLaVista(documento, plantilla)}
          continuacionesEnElEditor={enElEditor}
        />
        {documento.continuacion && tienePDF(documento) && (
          <AccionesDePDF id={documento.id} nombre={nombreDelDocumento(documento)} nombreDeArchivo={nombreDeArchivoDelPDF(documento)} />
        )}
      </div>

      {documento.continuacion ? (
        <AnexoDeContinuacion documento={documento} />
      ) : enElEditor && plantilla ? (
        <EditorDeDocumento
          documento={documento}
          plantilla={plantilla}
          retomado={retomado === "1"}
          actualizado={actualizado === "1"}
        />
      ) : (
        <VistaDeDocumento documento={documento} />
      )}
    </div>
  );
}
