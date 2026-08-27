import type { Metadata } from "next";
import Link from "next/link";
import { apiListPacientes } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { AvatarIniciales } from "@/components/panel/avatar-iniciales";
import { ClickableTableRow } from "@/components/panel/clickable-table-row";
import { ResponsiveTable } from "@/components/panel/responsive-table";

export const metadata: Metadata = { title: "Pacientes — Dental Mirage" };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// /panel/pacientes (T3.5) — tabla + buscador por nombre/apellido/DNI. La
// página sigue siendo Server Component (mismo criterio que /buscar); cada
// fila es clickeable de punta a punta (pedido explícito del cliente,
// 2026-08-23) vía `ClickableTableRow`, la única pieza de cliente acá.
//
// Debajo de `md` la tabla se reemplaza por una card por paciente (TR-064
// en docs/tradeoffs.md, pedido explícito del cliente — "Fix de bugs
// visuales responsive"): antes esta página forzaba un `min-w-[37.5rem]`
// que arrastraba TODA la página en un scroll horizontal en mobile — el
// buscador ahora ocupa el 100% del ancho real del viewport en vez de
// compartir ese mínimo fijo.
export default async function PacientesPage({ searchParams }: PageProps<"/panel/pacientes">) {
  const resolved = await searchParams;
  const q = firstParam(resolved.q);

  const token = await getSessionToken();
  const result = token ? await apiListPacientes(token, q) : null;
  const pacientes = result?.ok ? result.data : [];

  const tabla = (
    // Escritorio: max-h + scroll interno en las dos direcciones — sin
    // cambios. min-w-[600px] en la tabla (abajo) es un mínimo de
    // contenido real, sin cambios.
    <div className="max-h-[600px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
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
  );

  return (
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll... quitá
    // el padding-top sobrante").
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
        Pacientes
      </h1>

      <div className="flex flex-col gap-6">
        <form action="/panel/pacientes" method="get" className="flex max-w-md gap-2 max-md:w-full max-md:max-w-none">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nombre, apellido o DNI…"
            className="min-w-0 flex-1 rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-sm text-grafito outline-none focus:border-salvia"
          />
          <button type="submit" className="flex-shrink-0 rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95">
            Buscar
          </button>
        </form>

        <ResponsiveTable
          items={pacientes}
          getKey={(p) => p.id}
          table={tabla}
          empty={
            <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
              {q ? "No encontramos pacientes para esa búsqueda." : "Todavía no hay pacientes cargados."}
            </p>
          }
          renderCard={(p) => (
            <Link
              href={`/panel/pacientes/${p.id}`}
              className="flex flex-col gap-3 rounded-card border-[0.5px] border-arena bg-marfil p-4 shadow-soft hover:border-salvia"
            >
              <div className="flex items-center gap-3">
                <AvatarIniciales nombre={p.nombre} apellido={p.apellido} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-grafito">
                    {p.nombre} {p.apellido}
                  </p>
                  <p className="font-[family-name:var(--font-mono)] text-xs text-grafito/50">DNI {p.dni}</p>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="truncate font-[family-name:var(--font-mono)] text-xs text-grafito">{p.telefono}</p>
                {p.email && <p className="break-all font-[family-name:var(--font-mono)] text-xs text-grafito/50">{p.email}</p>}
              </div>
              <span className="self-end text-sm font-medium text-salvia-oscuro">Ver ficha →</span>
            </Link>
          )}
        />
      </div>
    </div>
  );
}
