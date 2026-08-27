import type { Metadata } from "next";
import Link from "next/link";
import { apiListTiposConsulta, apiListTurnos, type ListarTurnosParams } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { TurnosTable } from "@/components/panel/turnos-table";

export const metadata: Metadata = { title: "Turnos — Dental Mirage" };

type Tab = "pendiente" | "agendado" | "resuelto" | "cancelada" | "todas";

// "Resueltos" (pedido explícito del cliente, 2026-08-23) separa, dentro de
// lo que antes era una sola bolsa "Confirmadas", los turnos cuya hora de
// fin ya pasó — mejor organización, no un estado nuevo en la base: sigue
// siendo `agendado`, filtrado por `resuelto` (GET /turnos, ver
// internal/http/turnos.go).
const TABS: { label: string; tab: Tab }[] = [
  { label: "Pendientes", tab: "pendiente" },
  { label: "Confirmadas", tab: "agendado" },
  { label: "Resueltos", tab: "resuelto" },
  { label: "Canceladas", tab: "cancelada" },
  { label: "Todas", tab: "todas" },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTab(value: string | undefined): Tab {
  if (value === "pendiente" || value === "agendado" || value === "resuelto" || value === "cancelada") return value;
  return "todas";
}

function filtrosDeTab(tab: Tab, q: string | undefined): ListarTurnosParams {
  switch (tab) {
    case "resuelto":
      return { estado: "agendado", resuelto: true, q };
    case "agendado":
      return { estado: "agendado", resuelto: false, q };
    case "todas":
      return { q };
    default:
      return { estado: tab, q };
  }
}

// /panel/turnos (T3.3, "Turnos entrantes") — tabs + búsqueda por
// searchParams (GET, URL compartible, mismo patrón que /buscar): cada
// cambio de filtro navega y re-renderiza en el servidor, sin estado
// cliente para eso. Las acciones por fila (Confirmar/Editar/Cancelar) sí
// necesitan cliente — viven en TurnosTable.
export default async function TurnosPage({ searchParams }: PageProps<"/panel/turnos">) {
  const resolved = await searchParams;
  const tab = parseTab(firstParam(resolved.estado));
  const q = firstParam(resolved.q);
  // Deep-link desde TurnoDetalle ("Ver turno →", 2026-08-23): esa fila
  // arranca ya desplegada, ver TurnosTable/abrirId.
  const abrirId = firstParam(resolved.turno);

  const token = await getSessionToken();
  const filtros = filtrosDeTab(tab, q);

  const [tiposResult, turnosResult] = token
    ? await Promise.all([apiListTiposConsulta(token), apiListTurnos(token, filtros)])
    : [null, null];

  const tiposConsulta = tiposResult?.ok ? tiposResult.data : [];
  const turnos = turnosResult?.ok ? turnosResult.data : [];

  return (
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll... quitá
    // el padding-top sobrante"). El de arriba de todo ya lo da
    // `pt-[var(--header-height)]` en app/panel/layout.tsx (ese no se
    // toca) — este era una segunda capa redundante encima de esa.
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
        Turnos
      </h1>

      {/* Wrapper de ancho único (rama fix/mobile, sexta corrección
          2026-08-24 — ver TR-029 en docs/tradeoffs.md: "la box de la
          toolbar... y la box del calendario tienen anchos distintos...
          lo mismo en Turnos" — acá la fila de filtros tenía su propio
          min-width, 640px, distinto del min-w-[720px] de la tabla,
          abajo). 45rem = 720px, el mismo mínimo que ya tenía la tabla —
          filtros y tabla ahora comparten ESE número, con `w-full` en vez
          de un min-width propio en la fila de filtros.

          47.5rem = 760px (TR-067 en docs/tradeoffs.md, 2026-08-27):
          720px quedaba justo para el contenido real de las 7 columnas —
          la tabla (min-w-[720px] en turnos-table.tsx, mismo número)
          terminaba necesitando un pelín más de ancho que el que esta
          caja le daba, y ese sobrante se desbordaba por fuera de la
          tarjeta redondeada (`overflow-visible` en mobile no la recorta,
          la deja flotar sobre el fondo del panel) — de ahí el
          encabezado con su propio fondo/borde pareciendo separado de la
          fila de abajo. Confirmado en vivo por el cliente, agrandando
          este valor a mano en el inspector del navegador antes de
          tocar el código. Sigue siendo el mismo número en los dos
          lugares (acá y turnos-table.tsx) — el invariante de TR-029 no
          cambia, solo el valor compartido.

          55rem = 880px (TR-070 en docs/tradeoffs.md, 2026-08-27): la
          tabla ya quedaba bien con 760px, pero la FILA DE FILTROS (tabs
          Pendientes/Confirmadas/Resueltos/Canceladas/Todas + buscador)
          necesitaba más ancho del que le daba ese número — quedaba más
          corta que el buscador, desalineada. El cliente lo confirmó en
          vivo (agrandando este contenedor a mano antes de tocar el
          código, mismo método que TR-067/069) y midió el ancho real que
          pedía la fila de tabs con `scrollWidth`. Mismo número en los
          dos lugares (acá y turnos-table.tsx). */}
      <div className="flex flex-col gap-6 max-md:min-w-[55rem]">
        <div className="flex flex-wrap items-center justify-between gap-4 max-md:w-full max-md:flex-nowrap">
          <nav
            aria-label="Filtrar por estado"
            className="flex flex-wrap gap-1 rounded-full border-[0.5px] border-arena bg-marfil p-1 text-sm max-md:flex-nowrap"
          >
            {TABS.map((t) => {
              const active = t.tab === tab;
              const href = t.tab === "todas" ? `/panel/turnos${q ? `?q=${encodeURIComponent(q)}` : ""}` : `/panel/turnos?estado=${t.tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
              return (
                <Link
                  key={t.tab}
                  href={href}
                  className={`rounded-full px-4 py-2 font-medium max-md:whitespace-nowrap ${active ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <form action="/panel/turnos" method="get" className="flex gap-2 max-md:flex-shrink-0">
            {tab !== "todas" && <input type="hidden" name="estado" value={tab} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Nombre, apellido, DNI o email…"
              className="w-64 rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-sm text-grafito outline-none focus:border-salvia"
            />
            <button type="submit" className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 max-md:whitespace-nowrap">
              Buscar
            </button>
          </form>
        </div>

        {/* key por pestaña+búsqueda: fuerza a remontar TurnosTable en cada
            cambio de filtro. Sin esto, su `useState(turnosIniciales)` solo
            toma el valor inicial una vez — al navegar entre pestañas (misma
            instancia de componente, React no la desmonta solo porque cambió
            un prop) la tabla seguía mostrando los datos de la pestaña
            anterior hasta un refresh manual (bug reportado 2026-08-23). */}
        <TurnosTable
          key={`${tab}-${q ?? ""}-${abrirId ?? ""}`}
          turnosIniciales={turnos}
          tiposConsulta={tiposConsulta}
          filtros={filtros}
          abrirId={abrirId}
        />
      </div>
    </div>
  );
}
