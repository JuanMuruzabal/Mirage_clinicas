import type { Metadata } from "next";
import Link from "next/link";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import { notFound } from "next/navigation";
import { apiDocumentosDePaciente, apiGetPaciente } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { requireProfesional } from "@/lib/documentos-servidor";
import { RegistroDeDocumentos } from "@/components/documentos/registro-de-documentos";

export const metadata: Metadata = { title: "Documentos del paciente — PRISMA" };

// /panel/pacientes/[id]/documentos (Fase 5.1, R8 del brief) — el registro
// de documentos de un paciente: los terminados (de cualquier colega que lo
// atienda, con su autor) y lo mío en curso, del folio más nuevo al más
// viejo, con filtros (pedido del cliente, 2026-09-29).
const MIGA = `inline-flex items-center rounded-sm text-salvia-oscuro underline-offset-2 hover:text-grafito hover:underline ${CLASE_TACTIL}`;

export default async function DocumentosDelPacientePage({ params }: PageProps<"/panel/pacientes/[id]/documentos">) {
  await requireProfesional();
  const { id } = await params;
  const token = (await getSessionToken()) ?? "";
  const [paciente, documentos] = await Promise.all([apiGetPaciente(token, id), apiDocumentosDePaciente(token, id)]);
  if (!paciente.ok || !documentos.ok) notFound();
  const p = paciente.data;

  return (
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <div className="flex flex-col gap-3">
        {/* La misma miga que la página de un documento (2026-10-06). */}
        <nav aria-label="Ubicación">
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium text-grafito/80">
            <li>
              <Link href="/panel/pacientes" className={MIGA}>
                Pacientes
              </Link>
            </li>
            <li aria-hidden="true" className="text-grafito/75">
              ›
            </li>
            <li>
              <Link href={`/panel/pacientes/${p.id}`} className={MIGA}>
                {p.nombre} {p.apellido}
              </Link>
            </li>
          </ol>
        </nav>
        {/* El botón en la misma fila que el título, no arriba con el link de
            volver (pedido del cliente, 2026-09-29). */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.25rem,6vw,1.875rem)]">
            Documentos clínicos
          </h1>
          <Link
            href={`/panel/documentos?paciente=${p.id}`}
            className="inline-flex min-h-11 items-center rounded-full bg-salvia-oscuro px-5 text-sm font-semibold text-marfil hover:brightness-95"
          >
            + Nuevo documento
          </Link>
        </div>
        <p className="text-[15px] text-grafito/80">
          Paciente: <span className="font-semibold text-grafito">{p.nombre} {p.apellido}</span> · DNI {p.dni}
        </p>
      </div>

      <RegistroDeDocumentos documentos={documentos.data} />
    </div>
  );
}
