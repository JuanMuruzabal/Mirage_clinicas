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

      {/* Wrapper de ancho único (rama fix/mobile, sexta corrección
          2026-08-24 — ver TR-029 en docs/tradeoffs.md, mismo criterio
          que turnos/page.tsx): 37.5rem = 600px, el mínimo que ya tenía
          la tabla — el buscador ahora comparte ese mismo número en vez
          de su propio `max-w-md` (448px, más angosto).

          40rem = 640px (TR-067 en docs/tradeoffs.md, 2026-08-27): mismo
          motivo que en Turnos — 600px quedaba justo para el contenido
          real de la tabla, que se desbordaba por fuera de la tarjeta
          redondeada en mobile (`overflow-visible` no la recorta).
          Detalle completo del diagnóstico en el comentario de más abajo,
          sobre `min-w-[640px]` en la tabla. */}
      <div className="flex flex-col gap-6 max-md:min-w-[40rem]">
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

        {/* Escritorio: max-h + scroll interno en las dos direcciones —
            sin cambios. min-w-[640px] en la tabla (abajo, TR-067 en
            docs/tradeoffs.md) es un mínimo de contenido real.

            Mobile (ver TR-028/029 en docs/tradeoffs.md): esta caja DEJA
            de tener su propio scroll (`max-md:overflow-visible`) —
            ahora comparte el scroll de `<main>` (app/panel/layout.tsx)
            con el resto de la página, mismo criterio que
            turnos-table.tsx y docs/referencia-para-claude-code.html.
            `max-md:w-full`: mide lo mismo que el wrapper, no un
            min-width propio por separado.

            `md:sticky md:top-0 md:z-10` en el thead (TR-065 en
            docs/tradeoffs.md): con `overflow-visible` en mobile esta caja
            deja de ser su propio contenedor de scroll (lo es `<main>`),
            así que un `sticky` sin condición se pegaba contra ESE
            ancestro — el encabezado se veía como una cajita flotando
            separada de la fila de abajo. Sticky solo tiene sentido desde
            `md`, donde esta caja sí vuelve a ser su propio scroll. */}
        {pacientes.length === 0 ? (
          <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
            {q ? "No encontramos pacientes para esa búsqueda." : "Todavía no hay pacientes cargados."}
          </p>
        ) : (
          <div
            // `WebkitOverflowScrolling: "touch"` (sacado acá, TR-066 en
            // docs/tradeoffs.md): esa propiedad iOS es vestigial (mismo
            // criterio ya aplicado a `<main>` en panel-shell.tsx) y causa
            // real de bugs de repintado en WebKit — pero no era LA causa
            // de este bug puntual. El cliente confirmó que el encabezado
            // seguía viéndose separado incluso sin ella (ver TR-067: el
            // ancho mínimo compartido, arriba en este archivo, era la
            // causa real). Queda sacada igual por ser la corrección más
            // segura en general.
            className="max-h-[600px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-none max-md:w-full max-md:overflow-visible"
          >
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="md:sticky md:top-0 md:z-10">
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
    </div>
  );
}
