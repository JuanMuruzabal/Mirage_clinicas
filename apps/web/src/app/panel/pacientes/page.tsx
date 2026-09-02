import type { Metadata } from "next";
import { apiListPacientes } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { PacientesTable } from "@/components/panel/pacientes-table";
import { AgregarPacienteButton } from "@/components/panel/agregar-paciente-button";

export const metadata: Metadata = { title: "Pacientes — Dental Mirage" };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// /panel/pacientes (T3.5) — tabla + buscador por nombre/apellido/DNI. La
// página sigue siendo Server Component (mismo criterio que /buscar); la
// tabla en sí (fila clickeable de punta a punta, TR-023, + el panel
// desplegable de DNI/Email en mobile) vive en PacientesTable, la única
// pieza de cliente acá.
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
        {/* + Agregar paciente (Extra 2.3.5, E5.5) al lado del buscador —
            mismo criterio de layout que "+ Agregar turno"/"+ Reservar
            horario" en Calendario: acceso directo sin entrar a un turno
            primero. `flex-wrap` para que en mobile, con `w-full` en el
            buscador, el botón caiga a su propia línea en vez de
            achicarse. */}
        <div className="flex flex-wrap items-center gap-3">
          <form action="/panel/pacientes" method="get" className="flex max-w-md flex-1 gap-2 max-md:w-full max-md:max-w-none">
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
          <AgregarPacienteButton />
        </div>

        {/* Misma tabla en mobile y escritorio (rediseño local, ver
            comentario de arriba) — columnas reducidas debajo de `md`,
            DNI/Email pasan a un panel desplegable en mobile (ver
            PacientesTable, pedido explícito del cliente, 2026-08-27: "el
            DNI se sigue viendo pequeño en los datos, debe estar como
            dato desplegable no debajo del nombre"). */}
        {pacientes.length === 0 ? (
          <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
            {q ? "No encontramos pacientes para esa búsqueda." : "Todavía no hay pacientes cargados."}
          </p>
        ) : (
          <PacientesTable pacientes={pacientes} />
        )}
      </div>
    </div>
  );
}
