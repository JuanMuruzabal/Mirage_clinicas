import type { Metadata } from "next";
import Link from "next/link";
import { apiListConflictosPaciente, apiListPacientes, apiListTiposConsulta } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { PacientesTable } from "@/components/panel/pacientes-table";
import { AgregarPacienteButton } from "@/components/panel/agregar-paciente-button";
import { ConflictosPacienteBanner } from "@/components/panel/conflictos-paciente-banner";
import { QueEsVerificadoBoton } from "@/components/panel/que-es-verificado-boton";
import { IconSearch } from "@/components/icons";

export const metadata: Metadata = { title: "Pacientes — Dental Mirage" };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// TabPacientes — corrección de estética (2026-09-06, foto de referencia
// "nuevoestilopacientes.png"): pestañas Todos/Verificados/Sin verificar
// con cantidad al lado, mismo criterio que las pestañas de Turnos
// (TABS/conteoPorTab en turnos/page.tsx) — se calcula en JS a partir de
// `Paciente.verificado` (Fase 2.4.1), ya viene en la lista, sin pedir
// nada nuevo al backend.
type TabPacientes = "todos" | "verificados" | "sin_verificar";

function parseTabPacientes(value: string | undefined): TabPacientes {
  return value === "verificados" || value === "sin_verificar" ? value : "todos";
}

// /panel/pacientes (T3.5) — tabla + buscador por nombre/apellido/DNI. La
// página sigue siendo Server Component (mismo criterio que /buscar); la
// tabla en sí (fila clickeable de punta a punta, TR-023, + el panel
// desplegable de DNI/Email en mobile) vive en PacientesTable, la única
// pieza de cliente acá.
export default async function PacientesPage({ searchParams }: PageProps<"/panel/pacientes">) {
  const resolved = await searchParams;
  const q = firstParam(resolved.q);
  const tab = parseTabPacientes(firstParam(resolved.estado));

  const token = await getSessionToken();
  const result = token ? await apiListPacientes(token, q) : null;
  const pacientes = result?.ok ? result.data : [];
  const verificadosCount = pacientes.filter((p) => p.verificado).length;
  const conteoPorTab: Record<TabPacientes, number> = {
    todos: pacientes.length,
    verificados: verificadosCount,
    sin_verificar: pacientes.length - verificadosCount,
  };
  const pacientesFiltrados =
    tab === "todos" ? pacientes : pacientes.filter((p) => (tab === "verificados" ? p.verificado : !p.verificado));
  const querySecundaria = q ? `&q=${encodeURIComponent(q)}` : "";

  // Fase 2.4.1: conflictos de pacientes sin resolver (dos fichas
  // compitiendo por el mismo DNI, detectadas desde el formulario público)
  // — banner arriba de la tabla, igual criterio que el banner de
  // conflicto del calendario (TR-095).
  const conflictosResult = token ? await apiListConflictosPaciente(token) : null;
  const conflictos = conflictosResult?.ok ? conflictosResult.data : [];
  // Corrección de QA: la pantalla de resolución de conflictos muestra el
  // NOMBRE del tipo de consulta del turno en conflicto (y del que ya
  // estuviera activo, si hay colisión) — el endpoint de conflictos solo
  // trae el id.
  const tiposConsultaResult = token ? await apiListTiposConsulta(token) : null;
  const tiposConsulta = tiposConsultaResult?.ok ? tiposConsultaResult.data : [];

  return (
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll... quitá
    // el padding-top sobrante").
    <div className="flex flex-col gap-6 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      {/* Contador total (mismo criterio de estética que "Turnos 14 en
          total", corrección 2026-09-06, foto de referencia
          "nuevoestilopacientes.png"). */}
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
          Pacientes
        </h1>
        <span className="text-sm text-grafito/50">{conteoPorTab.todos} registrados</span>
      </div>

      <ConflictosPacienteBanner conflictos={conflictos} tiposConsulta={tiposConsulta} />

      {/* Corrección de estética (2026-09-06, foto de referencia): buscador
          + "+ Agregar paciente" van juntos en su fila, pestañas
          Todos/Verificados/Sin verificar debajo — mismo orden y mismo
          criterio que el rediseño de Turnos (buscador+Filtros arriba,
          pestañas abajo). El botón "Buscar" se saca del todo, igual que
          en Turnos — el `<form>` sigue siendo un GET real, Enter alcanza.
          Tabla sin cambios (mismo pedido explícito del cliente que en
          Turnos: "las tablas dejelas como estaba, no toque eso"). */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <form action="/panel/pacientes" method="get" className="relative flex max-w-md flex-1 max-md:w-full max-md:max-w-none">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-grafito/40" />
            {tab !== "todos" && <input type="hidden" name="estado" value={tab} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Nombre, apellido o DNI…"
              className="w-full rounded-field border-[0.5px] border-arena bg-marfil py-2 pr-3 pl-9 text-sm text-grafito outline-none focus:border-salvia"
            />
          </form>
          <AgregarPacienteButton />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Corrección de estética (2026-09-06, foto de referencia
              "nuevoestilopacientes.png"): fondo tenue sin borde (antes
              `bg-marfil border-arena`, un recuadro con línea visible) —
              la foto muestra una franja apenas más oscura que el fondo
              de la página, sin borde marcado. */}
          <nav aria-label="Filtrar por verificación" className="flex flex-wrap items-center gap-1 rounded-card bg-hueso p-1 text-sm md:rounded-full">

            {(
              [
                { tab: "todos" as const, label: "Todos" },
                { tab: "verificados" as const, label: "Verificados" },
                { tab: "sin_verificar" as const, label: "Sin verificar" },
              ]
            ).map((t) => {
              const active = t.tab === tab;
              const href = `/panel/pacientes?estado=${t.tab}${querySecundaria}`;
              return (
                <Link
                  key={t.tab}
                  href={href}
                  className={`flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-center font-medium whitespace-nowrap ${active ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
                >
                  {t.label}
                  <span className={active ? "text-marfil/70" : "text-grafito/40"}>{conteoPorTab[t.tab]}</span>
                </Link>
              );
            })}
          </nav>
          <QueEsVerificadoBoton />
        </div>

        {/* Misma tabla en mobile y escritorio (rediseño local, ver
            comentario de arriba) — columnas reducidas debajo de `md`,
            DNI/Email pasan a un panel desplegable en mobile (ver
            PacientesTable, pedido explícito del cliente, 2026-08-27: "el
            DNI se sigue viendo pequeño en los datos, debe estar como
            dato desplegable no debajo del nombre"). */}
        {pacientesFiltrados.length === 0 ? (
          <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
            {q
              ? "No encontramos pacientes para esa búsqueda."
              : pacientes.length === 0
                ? "Todavía no hay pacientes cargados."
                : "No hay pacientes en esta pestaña."}
          </p>
        ) : (
          <PacientesTable pacientes={pacientesFiltrados} />
        )}
      </div>
    </div>
  );
}
