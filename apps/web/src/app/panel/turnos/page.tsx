import type { Metadata } from "next";
import Link from "next/link";
import { apiListTiposConsulta, apiListTurnos, type ListarTurnosParams } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { finDiaCordobaISO, inicioDiaCordobaISO, rangoRapidoFechas, type RangoRapido } from "@/lib/calendar-utils";
import { TurnosTable } from "@/components/panel/turnos-table";

export const metadata: Metadata = { title: "Turnos — Dental Mirage" };

type Tab = "agendado" | "resuelto" | "cancelada" | "todas";

// "Resueltos" (pedido explícito del cliente, 2026-08-23) separa, dentro de
// lo que antes era una sola bolsa "Confirmadas", los turnos cuya hora de
// fin ya pasó — mejor organización, no un estado nuevo en la base: sigue
// siendo `agendado`, filtrado por `resuelto` (GET /turnos, ver
// internal/http/turnos.go).
// "Pendientes" sacada de las pestañas (Extra 2.3.3, TR-104): ese estado
// se eliminó del todo — un turno siempre nace `agendado`, con horario
// real, incluso el que llega de la página pública (Extra 2.3.5). "Todas"
// se había sacado de las pestañas en ese mismo cambio (entrar sin
// `?estado=` autoseleccionaba "Confirmadas", E3.2) — pedido explícito del
// cliente, se repone como pestaña visible de nuevo; el DEFAULT sin
// `?estado=` sigue siendo "Confirmadas" (parseTab de abajo), la única
// diferencia es que ahora "Todas" también se puede elegir a mano.
const TABS: { label: string; tab: Tab }[] = [
  { label: "Confirmadas", tab: "agendado" },
  { label: "Resueltos", tab: "resuelto" },
  { label: "Canceladas", tab: "cancelada" },
  { label: "Todas", tab: "todas" },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTab(value: string | undefined): Tab {
  if (value === "resuelto" || value === "cancelada" || value === "todas") return value;
  return "agendado";
}

// desde/hasta llegan como "YYYY-MM-DD" (URL/`<input type="date">`) — acá
// se convierten al instante RFC3339 que de verdad exige el backend (bug
// de QA, ver el comentario grande de inicioDiaCordobaISO/finDiaCordobaISO
// en lib/calendar-utils.ts). El resto de este archivo sigue usando la
// versión plana (URL, `defaultValue` de los inputs) — la conversión pasa
// únicamente acá, justo antes de armar los filtros para la API.
function filtrosDeTab(
  tab: Tab,
  q: string | undefined,
  desde: string | undefined,
  hasta: string | undefined,
  tipoConsultaId: string | undefined,
): ListarTurnosParams {
  const base: ListarTurnosParams = (() => {
    switch (tab) {
      case "resuelto":
        return { estado: "agendado", resuelto: true, q };
      case "agendado":
        return { estado: "agendado", resuelto: false, q };
      case "cancelada":
        return { estado: "cancelada", q };
      default:
        // "todas" — sin filtro de estado, trae agendados y cancelados juntos.
        return { q };
    }
  })();
  return {
    ...base,
    desde: desde ? inicioDiaCordobaISO(desde) : undefined,
    hasta: hasta ? finDiaCordobaISO(hasta) : undefined,
    tipoConsultaId,
  };
}

// RANGOS_RAPIDOS — Extra 2.3.3 (E3.5): "filtro rápido HOY/SEMANA/MES antes
// de Desde/Hasta" — atajos que precargan Desde/Hasta con un rango ya
// calculado (rangoRapidoFechas, lib/calendar-utils.ts), en vez de que el
// profesional tenga que elegir las dos fechas a mano para el caso común.
const RANGOS_RAPIDOS: { label: string; rango: RangoRapido }[] = [
  { label: "Hoy", rango: "hoy" },
  { label: "Semana", rango: "semana" },
  { label: "Mes", rango: "mes" },
];

// /panel/turnos (T3.3, "Turnos entrantes") — tabs + búsqueda por
// searchParams (GET, URL compartible, mismo patrón que /buscar): cada
// cambio de filtro navega y re-renderiza en el servidor, sin estado
// cliente para eso. Las acciones por fila (Confirmar/Editar/Cancelar) sí
// necesitan cliente — viven en TurnosTable.
export default async function TurnosPage({ searchParams }: PageProps<"/panel/turnos">) {
  const resolved = await searchParams;
  const tab = parseTab(firstParam(resolved.estado));
  const q = firstParam(resolved.q);
  // Desde/Hasta (Extra 2.3.3, E3.5) — mismos nombres de query param que
  // el resto de este archivo (GET, URL compartible): un rango vacío no
  // filtra nada, igual que hoy filtrosDeTab omite `q` cuando no vino.
  const desde = firstParam(resolved.desde);
  const hasta = firstParam(resolved.hasta);
  // tipoConsultaId (corrección de QA: "faltó el filtro de tipo de
  // consulta" en Turnos) — mismo filtro que ya tenía "Turnos activos"/
  // "Historial" de la ficha de paciente, acá resuelto en el servidor.
  const tipoConsultaId = firstParam(resolved.tipoConsultaId);
  // Deep-link desde TurnoDetalle ("Ver turno →", 2026-08-23): esa fila
  // arranca ya desplegada, ver TurnosTable/abrirId.
  const abrirId = firstParam(resolved.turno);

  const token = await getSessionToken();
  const filtros = filtrosDeTab(tab, q, desde, hasta, tipoConsultaId);

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
              const href = `/panel/turnos?estado=${t.tab}${q ? `&q=${encodeURIComponent(q)}` : ""}${tipoConsultaId ? `&tipoConsultaId=${tipoConsultaId}` : ""}`;
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
            <input type="hidden" name="estado" value={tab} />
            {desde && <input type="hidden" name="desde" value={desde} />}
            {hasta && <input type="hidden" name="hasta" value={hasta} />}
            {tipoConsultaId && <input type="hidden" name="tipoConsultaId" value={tipoConsultaId} />}
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

        {/* Extra 2.3.3 (E3.5): filtro rápido HOY/SEMANA/MES antes de
            Desde/Hasta — mismo par de campos que ya tenía
            paciente-turnos-table.tsx, acá server-driven vía searchParams
            en vez de estado de cliente (esta página nunca tuvo filtro de
            fecha, era pura tab+búsqueda). Los atajos son links (navegan
            directo con Desde/Hasta ya calculados); el form de abajo es
            para un rango elegido a mano. */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {RANGOS_RAPIDOS.map((r) => {
            const calculado = rangoRapidoFechas(r.rango);
            const activo = desde === calculado.desde && hasta === calculado.hasta;
            const href = `/panel/turnos?estado=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}${tipoConsultaId ? `&tipoConsultaId=${tipoConsultaId}` : ""}&desde=${calculado.desde}&hasta=${calculado.hasta}`;
            return (
              <Link
                key={r.rango}
                href={href}
                // Corrección de QA: mismo verde sólido que "Buscar"/
                // "Confirmar" (bg-salvia-oscuro) en vez del borde neutro
                // que usan los botones secundarios (Editar, etc.) — el
                // activo suma un anillo para distinguirse sin dejar de
                // ser verde.
                className={`rounded-full bg-salvia-oscuro px-3 py-1.5 text-xs font-semibold text-marfil hover:brightness-95 whitespace-nowrap ${activo ? "ring-2 ring-offset-1 ring-salvia-oscuro" : ""}`}
              >
                {r.label}
              </Link>
            );
          })}
          <form action="/panel/turnos" method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="estado" value={tab} />
            {q && <input type="hidden" name="q" value={q} />}
            {/* Corrección de QA: "faltó el filtro de tipo de consulta" —
                mismo filtro que ya tenía "Turnos activos"/"Historial" de
                la ficha de paciente (paciente-turnos-table.tsx), acá
                resuelto en el servidor junto con Desde/Hasta (mismo
                botón "Aplicar"). */}
            {tiposConsulta.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-grafito/60">
                Tipo
                <select
                  name="tipoConsultaId"
                  defaultValue={tipoConsultaId ?? ""}
                  className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs text-grafito outline-none focus:border-salvia"
                >
                  <option value="">Todos los tipos</option>
                  {tiposConsulta.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs text-grafito/60">
              Desde
              <input
                type="date"
                name="desde"
                defaultValue={desde}
                className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs text-grafito outline-none focus:border-salvia"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-grafito/60">
              Hasta
              <input
                type="date"
                name="hasta"
                defaultValue={hasta}
                className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs text-grafito outline-none focus:border-salvia"
              />
            </label>
            <button
              type="submit"
              className="rounded-full bg-salvia-oscuro px-3 py-1.5 text-xs font-semibold text-marfil hover:brightness-95"
            >
              Aplicar
            </button>
          </form>
          {(desde || hasta || tipoConsultaId) && (
            <Link
              href={`/panel/turnos?estado=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="text-xs font-medium text-salvia-oscuro hover:text-grafito"
            >
              Limpiar filtros
            </Link>
          )}
        </div>

        {/* key por pestaña+búsqueda+rango de fecha: fuerza a remontar
            TurnosTable en cada cambio de filtro. Sin esto, su
            `useState(turnosIniciales)` solo toma el valor inicial una vez
            — al navegar entre pestañas (misma instancia de componente,
            React no la desmonta solo porque cambió un prop) la tabla
            seguía mostrando los datos de la pestaña anterior hasta un
            refresh manual (bug reportado 2026-08-23). */}
        <TurnosTable
          key={`${tab}-${q ?? ""}-${desde ?? ""}-${hasta ?? ""}-${tipoConsultaId ?? ""}-${abrirId ?? ""}`}
          turnosIniciales={turnos}
          tiposConsulta={tiposConsulta}
          filtros={filtros}
          abrirId={abrirId}
        />
      </div>
    </div>
  );
}
