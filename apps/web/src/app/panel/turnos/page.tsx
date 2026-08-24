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
    <div className="flex flex-col gap-6 p-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Turnos</h1>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1 rounded-full border-[0.5px] border-arena bg-marfil p-1 text-sm">
          {TABS.map((t) => {
            const active = t.tab === tab;
            const href = t.tab === "todas" ? `/panel/turnos${q ? `?q=${encodeURIComponent(q)}` : ""}` : `/panel/turnos?estado=${t.tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return (
              <Link
                key={t.tab}
                href={href}
                className={`rounded-full px-4 py-2 font-medium ${active ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <form action="/panel/turnos" method="get" className="flex gap-2">
          {tab !== "todas" && <input type="hidden" name="estado" value={tab} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Nombre, apellido, DNI o email…"
            className="w-64 rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-sm text-grafito outline-none focus:border-salvia"
          />
          <button type="submit" className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95">
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
  );
}
