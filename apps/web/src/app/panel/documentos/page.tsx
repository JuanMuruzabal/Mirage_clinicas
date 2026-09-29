import type { Metadata } from "next";
import { plantillasVigentes } from "@dental-mirage/documentos-clinicos";
import { apiDocumentosEnCurso, apiGetPaciente, apiPacientesConDocumentos } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { hoyEnCordoba, requireProfesional } from "@/lib/documentos-servidor";
import { ModuloDocumentos } from "@/components/documentos/modulo-documentos";
import { TablaDeDocumentos, TablaPacientesConDocumentos } from "@/components/documentos/tablas-de-documentos";

export const metadata: Metadata = { title: "Documentos clínicos — PRISMA" };

function primero(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

// /panel/documentos (Fase 5.1) — el módulo de documentos clínicos: elegir
// un documento en el carrusel, ver el modelo original, completarlo para un
// paciente. Debajo del botón, lo que quedó en curso; al fondo, los
// pacientes que ya tienen documentos (pedido del cliente, 2026-09-28).
// `?paciente=<id>` llega desde la ficha: el documento es para esa persona.
// `?plantilla=<id>` elige el documento de entrada.
export default async function DocumentosPage({ searchParams }: PageProps<"/panel/documentos">) {
  await requireProfesional();
  const token = (await getSessionToken()) ?? "";
  const params = await searchParams;
  const pacienteId = primero(params.paciente);

  const [pacientes, enCurso, paciente] = await Promise.all([
    apiPacientesConDocumentos(token),
    apiDocumentosEnCurso(token),
    pacienteId ? apiGetPaciente(token, pacienteId) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-8 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.25rem,6vw,1.875rem)]">
        Documentos clínicos
      </h1>

      <ModuloDocumentos
        plantillas={plantillasVigentes()}
        plantillaInicial={primero(params.plantilla)}
        paciente={paciente?.ok ? { id: paciente.data.id, nombre: paciente.data.nombre, apellido: paciente.data.apellido } : undefined}
        hoy={hoyEnCordoba()}
        enCurso={
          enCurso.ok && enCurso.data.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Tus documentos en curso</h2>
              <TablaDeDocumentos documentos={enCurso.data} conPaciente compacta vacio="" />
            </section>
          ) : undefined
        }
        abajo={
          <section className="flex flex-col gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Pacientes con documentos clínicos</h2>
            {pacientes.ok ? (
              <TablaPacientesConDocumentos pacientes={pacientes.data} />
            ) : (
              <p role="alert" className="text-sm text-terracota-oscuro">
                {pacientes.error}
              </p>
            )}
          </section>
        }
      />
    </div>
  );
}
