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
// "Todas" sacada de las pestañas (pedido explícito del cliente,
// 2026-08-27) — `parseTab`/`filtrosDeTab` siguen resolviendo ese caso
// (sin filtro) para quien llega sin `?estado=` en la URL, solo que ya no
// hay un botón propio para elegirlo a mano.
const TABS: { label: string; tab: Tab }[] = [
  { label: "Pendientes", tab: "pendiente" },
  { label: "Confirmadas", tab: "agendado" },
  { label: "Resueltos", tab: "resuelto" },
  { label: "Canceladas", tab: "cancelada" },
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

      {/* Rediseño 2026-08-27 (pedido explícito del cliente: "reformular
          lo de moverse horizontalmente y verticalmente en gestión de
          clínica"). Reemplaza el criterio de TR-029/067/070 (esta fila y
          la tabla compartían un min-width fijo — 880px — para forzar el
          scroll horizontal unificado de <main>): la tabla es LA MISMA en
          mobile y escritorio, con scroll propio (ver turnos-table.tsx) —
          ya no hace falta ningún ancho forzado acá, el buscador pasa a
          ocupar el 100% del ancho disponible y los tabs scrollean en su
          PROPIO contenedor (`overflow-x-auto` únicamente en el `<nav>`,
          no en toda la fila ni en la página) en vez de arrastrar el
          resto de la pantalla de costado. Cero cambio en escritorio (sin
          `md:`, sigue igual). */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 max-md:flex-col max-md:items-stretch">
          <nav
            aria-label="Filtrar por estado"
            // Grid de 2×2 en mobile en vez de una fila con scroll propio
            // (pedido explícito del cliente, 2026-08-27: "el
            // seleccionador... sigue haciendo overflow, lo que habilita
            // el desplazamiento horizontal de este apartado, cosa que no
            // es correcto") — con 4 tabs de texto largo ("Confirmadas",
            // "Canceladas"), ni sacándole el min-width al `<nav>`
            // alcanzaba para que entren en una sola fila en pantallas
            // angostas: seguía necesitando su propio `overflow-x-auto`
            // para no desbordar, que es exactamente el movimiento
            // horizontal que se pidió sacar. Un grid de 2 columnas
            // siempre entra sin necesitar scroll, sea cual sea el ancho.
            // Desde `md` vuelve a ser la fila original (`rounded-full`,
            // una sola línea) — cero cambio en escritorio.
            className="grid grid-cols-2 gap-1 rounded-card border-[0.5px] border-arena bg-marfil p-1 text-sm md:flex md:flex-nowrap md:items-center md:overflow-x-auto md:rounded-full"
          >
            {TABS.map((t) => {
              const active = t.tab === tab;
              const href = t.tab === "todas" ? `/panel/turnos${q ? `?q=${encodeURIComponent(q)}` : ""}` : `/panel/turnos?estado=${t.tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
              return (
                <Link
                  key={t.tab}
                  href={href}
                  className={`rounded-full px-4 py-2 text-center font-medium whitespace-nowrap ${active ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <form action="/panel/turnos" method="get" className="flex gap-2 max-md:w-full">
            {tab !== "todas" && <input type="hidden" name="estado" value={tab} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Nombre, apellido, DNI o email…"
              className="w-64 rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-sm text-grafito outline-none focus:border-salvia max-md:w-full max-md:flex-1"
            />
            <button type="submit" className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 whitespace-nowrap">
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
