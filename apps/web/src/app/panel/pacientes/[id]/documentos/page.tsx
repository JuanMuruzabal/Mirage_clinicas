import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiDocumentosDePaciente, apiGetPaciente } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { requireProfesional } from "@/lib/documentos-servidor";
import { TablaDeDocumentos } from "@/components/documentos/tablas-de-documentos";

export const metadata: Metadata = { title: "Documentos del paciente — PRISMA" };

// /panel/pacientes/[id]/documentos (Fase 5.1, R8 del brief) — el registro
// de documentos de un paciente: los firmados (de cualquier colega que lo
// atienda, con su autor) y lo mío en curso, del folio más nuevo al más
// viejo.
export default async function DocumentosDelPacientePage({ params }: PageProps<"/panel/pacientes/[id]/documentos">) {
  await requireProfesional();
  const { id } = await params;
  const token = (await getSessionToken()) ?? "";
  const [paciente, documentos] = await Promise.all([apiGetPaciente(token, id), apiDocumentosDePaciente(token, id)]);
  if (!paciente.ok || !documentos.ok) notFound();
  const p = paciente.data;

  return (
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href={`/panel/pacientes/${p.id}`} className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
            ← {p.nombre} {p.apellido}
          </Link>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.25rem,6vw,1.875rem)]">
            Documentos clínicos
          </h1>
          <p className="text-sm text-grafito/80">
            {p.nombre} {p.apellido} · DNI {p.dni}
          </p>
        </div>
        <Link
          href={`/panel/documentos?paciente=${p.id}`}
          className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
        >
          + Nuevo documento
        </Link>
      </div>

      <TablaDeDocumentos documentos={documentos.data} vacio="Todavía no hay documentos para este paciente." />
    </div>
  );
}
