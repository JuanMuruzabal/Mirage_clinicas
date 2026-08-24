import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Turno } from "@dental-mirage/shared-types";
import { apiGetPaciente, apiListTiposConsulta } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { PacienteDatos } from "@/components/panel/paciente-datos";
import { PacienteTurnosTable } from "@/components/panel/paciente-turnos-table";
import { AvatarIniciales } from "@/components/panel/avatar-iniciales";

export async function generateMetadata({ params }: PageProps<"/panel/pacientes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const token = await getSessionToken();
  const result = token ? await apiGetPaciente(token, id) : null;
  if (!result?.ok) return {};
  return { title: `${result.data.nombre} ${result.data.apellido} — Dental Mirage` };
}

function esActivo(t: Turno): boolean {
  return t.estado === "agendado" && (!t.horaFin || new Date(t.horaFin) >= new Date());
}

// /panel/pacientes/[id] (T3.6) — datos personales + historial de turnos
// (separado en "activos"/"historial" del lado del cliente, sin pedirle dos
// veces al backend, ver internal/http/pacientes.go), en formato de tabla
// (pedido explícito del cliente, 2026-08-23) — mismo componente,
// PacienteTurnosTable, que también resuelve el tipo de consulta (color +
// nombre) contra GET /tipos-consulta. Los bloques de historia clínica y
// presupuesto (spec §4.5) son placeholders puramente visuales en este
// sprint — no hay upload ni backend detrás todavía.
export default async function PacienteDetallePage({ params }: PageProps<"/panel/pacientes/[id]">) {
  const { id } = await params;
  const token = await getSessionToken();
  const [result, tiposResult] = token
    ? await Promise.all([apiGetPaciente(token, id), apiListTiposConsulta(token)])
    : [null, null];
  if (!result?.ok) {
    notFound();
  }
  const paciente = result.data;
  const tiposConsulta = tiposResult?.ok ? tiposResult.data : [];
  const activos = paciente.turnos.filter(esActivo);
  const historial = paciente.turnos.filter((t) => !esActivo(t));

  return (
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll").
    <div className="flex flex-col gap-8 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/panel/pacientes" className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
            ← Pacientes
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <AvatarIniciales nombre={paciente.nombre} apellido={paciente.apellido} className="h-11 w-11 text-base" />
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.25rem,6vw,1.875rem)]">
              {paciente.nombre} {paciente.apellido}
            </h1>
          </div>
        </div>
      </div>

      <PacienteDatos pacienteInicial={paciente} />

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Turnos activos</h2>
        <PacienteTurnosTable turnos={activos} tiposConsulta={tiposConsulta} vacio="No tiene turnos agendados por venir." />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Historial de turnos</h2>
        <PacienteTurnosTable turnos={historial} tiposConsulta={tiposConsulta} vacio="Todavía no hay turnos pasados o pendientes." />
      </section>

      {/* Placeholders puramente visuales (spec §4.5) — sin funcionalidad
          de carga/adjuntos en este sprint. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-card border-[0.5px] border-dashed border-arena bg-hueso p-6">
          <h2 className="font-[family-name:var(--font-display)] text-base font-medium text-grafito/50">Historia clínica</h2>
          <p className="text-sm text-grafito/50">Próximamente vas a poder cargar y consultar la historia clínica desde acá.</p>
        </div>
        <div className="flex flex-col gap-2 rounded-card border-[0.5px] border-dashed border-arena bg-hueso p-6">
          <h2 className="font-[family-name:var(--font-display)] text-base font-medium text-grafito/50">Presupuesto</h2>
          <p className="text-sm text-grafito/50">Próximamente vas a poder armar y compartir presupuestos desde acá.</p>
        </div>
      </section>
    </div>
  );
}
