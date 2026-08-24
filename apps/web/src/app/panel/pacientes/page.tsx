import type { Metadata } from "next";
import Link from "next/link";
import { apiListPacientes } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { AvatarIniciales } from "@/components/panel/avatar-iniciales";
import { ClickableTableRow } from "@/components/panel/clickable-table-row";

export const metadata: Metadata = { title: "Pacientes — Dental Mirage" };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// /panel/pacientes (T3.5) — tabla + buscador por nombre/apellido/DNI. La
// página sigue siendo Server Component (mismo criterio que /buscar); cada
// fila es clickeable de punta a punta (pedido explícito del cliente,
// 2026-08-23) vía `ClickableTableRow`, la única pieza de cliente acá.
export default async function PacientesPage({ searchParams }: PageProps<"/panel/pacientes">) {
  const resolved = await searchParams;
  const q = firstParam(resolved.q);

  const token = await getSessionToken();
  const result = token ? await apiListPacientes(token, q) : null;
  const pacientes = result?.ok ? result.data : [];

  return (
    <div className="flex flex-col gap-6 p-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Pacientes</h1>

      <form action="/panel/pacientes" method="get" className="flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Nombre, apellido o DNI…"
          className="flex-1 rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-sm text-grafito outline-none focus:border-salvia"
        />
        <button type="submit" className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95">
          Buscar
        </button>
      </form>

      {/* pacientes.length === 0 ? ... : tabla con max-h + overflow-y-auto —
          mismo criterio que el calendario (T2.3) y la tabla de Turnos: no
          estira la página a medida que crecen los pacientes. thead sticky
          para no perder las columnas al scrollear. */}
      {pacientes.length === 0 ? (
        <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
          {q ? "No encontramos pacientes para esa búsqueda." : "Todavía no hay pacientes cargados."}
        </p>
      ) : (
        <div className="max-h-[600px] overflow-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b-[0.5px] border-arena bg-marfil text-xs font-semibold uppercase tracking-wide text-grafito/60">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">DNI</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => (
                <ClickableTableRow
                  key={p.id}
                  href={`/panel/pacientes/${p.id}`}
                  className="border-b-[0.5px] border-arena last:border-b-0 hover:bg-arena"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AvatarIniciales nombre={p.nombre} apellido={p.apellido} />
                      <span className="font-medium text-grafito">
                        {p.nombre} {p.apellido}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.dni}</td>
                  <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.telefono}</td>
                  <td className="px-4 py-3 text-grafito/60">{p.email || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/panel/pacientes/${p.id}`} className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
                      Ver ficha →
                    </Link>
                  </td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
