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
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll... quitá
    // el padding-top sobrante").
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
        Pacientes
      </h1>

      {/* Rediseño 2026-08-27 (pedido explícito del cliente, reemplaza el
          intento de cards apiladas) — "quiero que las tablas...
          funcionen de la misma forma que en
          escritorio... dar la información clave a la vista"). Reemplaza
          el criterio de TR-029/067/069/070 (esta caja y la tabla
          compartían un min-width fijo — 880px — para forzar el scroll
          horizontal unificado de <main>): la tabla sigue siendo la
          MISMA en mobile y escritorio (ver más abajo), con menos
          columnas visibles en mobile — ya no hace falta ningún ancho
          forzado acá, el buscador vuelve a su `max-w-md` original, a
          ancho completo en mobile. Cero cambio en escritorio. */}
      <div className="flex flex-col gap-6">
        <form action="/panel/pacientes" method="get" className="flex max-w-md gap-2 max-md:w-full max-md:max-w-none">
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

        {/* Misma tabla en mobile y escritorio (rediseño local, ver
            comentario de arriba) — columnas reducidas debajo de `md`:
            DNI se suma como subtítulo bajo el nombre (mismo criterio que
            Turnos) en vez de columna propia, Email se oculta del todo
            (Nombre/Teléfono ya alcanzan como info clave; el resto está
            a un toque, en la ficha completa). `max-h-[600px]
            overflow-y-auto` sin condición de mobile: esta caja saca su
            propia scrollbar vertical con muchos pacientes, en vez de
            alargar la página. */}
        {pacientes.length === 0 ? (
          <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
            {q ? "No encontramos pacientes para esa búsqueda." : "Todavía no hay pacientes cargados."}
          </p>
        ) : (
          <div className="max-h-[600px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b-[0.5px] border-arena bg-marfil text-xs font-semibold uppercase tracking-wide text-grafito/60">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="max-md:hidden px-4 py-3">DNI</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="max-md:hidden px-4 py-3">Email</th>
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
                        <div>
                          <p className="font-medium text-grafito">
                            {p.nombre} {p.apellido}
                          </p>
                          <p className="font-[family-name:var(--font-mono)] text-xs text-grafito/50 md:hidden">DNI {p.dni}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-md:hidden px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.dni}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{p.telefono}</td>
                    <td className="max-md:hidden px-4 py-3 text-grafito/60">{p.email || "—"}</td>
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
    </div>
  );
}
