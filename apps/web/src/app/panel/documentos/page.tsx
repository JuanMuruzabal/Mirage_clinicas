import type { Metadata } from "next";
import { plantillasDelSelector } from "@dental-mirage/documentos-clinicos";
import { apiDocumentosEnCurso, apiGetPaciente, apiPacientesConDocumentos } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { hoyEnCordoba, requireProfesional } from "@/lib/documentos-servidor";
import { muestrasSiFaltan } from "@/lib/documentos-de-muestra";
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
// `?plantilla=<id>` elige el documento de entrada. Mientras haya menos de
// tres modelos, la pila se completa con hojas de muestra (2026-09-29).
export default async function DocumentosPage({ searchParams }: PageProps<"/panel/documentos">) {
  await requireProfesional();
  const token = (await getSessionToken()) ?? "";
  const params = await searchParams;
  const pacienteId = primero(params.paciente);
  // El anexo de continuación no: se crea desde su historia (Fase 5.6d).
  const plantillas = plantillasDelSelector();

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
        plantillas={plantillas}
        muestras={muestrasSiFaltan(plantillas.length)}
        plantillaInicial={primero(params.plantilla)}
        paciente={paciente?.ok ? { id: paciente.data.id, nombre: paciente.data.nombre, apellido: paciente.data.apellido } : undefined}
        hoy={hoyEnCordoba()}
        // `enCurso` y `abajo` llevan `key` aunque no son una lista acá: en
        // desarrollo, un elemento que viaja del servidor al cliente como prop
        // llega todavía sin resolver, y ModuloDocumentos lo dibuja entre sus
        // hijos estáticos; React no lo da por validado y avisa que falta la
        // `key` ("It was passed a child from DocumentosPage").
        enCurso={
          enCurso.ok && enCurso.data.length > 0 ? (
            <section key="en-curso" className="flex flex-col gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Tus documentos en curso</h2>
              <TablaDeDocumentos documentos={enCurso.data} conPaciente compacta vacio="" />
            </section>
          ) : undefined
        }
        abajo={
          <section key="pacientes-con-documentos" className="flex flex-col gap-3">
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
