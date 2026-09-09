import type { Metadata } from "next";
import Link from "next/link";
import { apiContarPacientes, apiListConflictosPaciente, apiListPacientesPaginado, apiListTiposConsulta } from "@/lib/api";
import type { ListarPacientesParams } from "@/lib/api";
import { PACIENTES_POR_PAGINA } from "@/lib/paginacion";
import { getSessionToken } from "@/lib/session";
import { PacientesTable } from "@/components/panel/pacientes-table";
import { AgregarPacienteButton } from "@/components/panel/agregar-paciente-button";
import { ConflictosPacienteBanner } from "@/components/panel/conflictos-paciente-banner";
import { QueEsVerificadoBoton } from "@/components/panel/que-es-verificado-boton";
import { BuscadorEnVivo } from "@/components/panel/buscador-en-vivo";

export const metadata: Metadata = { title: "Pacientes — PRISMA" };

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

  // Fase B de la auditoría: hasta acá esta pantalla pedía la lista
  // COMPLETA de fichas de la clínica y resolvía en el navegador tanto el
  // filtro de pestaña como sus tres contadores. Ahora la pestaña activa
  // pide solo la primera tanda (PACIENTES_POR_PAGINA, el resto llega con
  // "Cargar más") y las otras dos piden únicamente el total
  // (apiContarPacientes: 1 fila + X-Total-Count). El filtro
  // verificado/sin verificar baja al backend con el mismo parámetro y la
  // misma subquery que ya usaba /turnos — filtrar una tanda parcial del
  // lado del cliente mostraría cualquier cosa.
  const filtros: ListarPacientesParams = {
    q,
    verificacion: tab === "verificados" ? "verificado" : tab === "sin_verificar" ? "sin_verificar" : undefined,
  };
  const [paginaPacientes, cTodos, cVerificados, cSinVerificar] = token
    ? await Promise.all([
        apiListPacientesPaginado(token, filtros, PACIENTES_POR_PAGINA, 0),
        apiContarPacientes(token, { q }),
        apiContarPacientes(token, { q, verificacion: "verificado" }),
        apiContarPacientes(token, { q, verificacion: "sin_verificar" }),
      ])
    : [null, 0, 0, 0];

  const pacientesFiltrados = paginaPacientes?.ok ? paginaPacientes.data.items : [];
  const totalPacientes = paginaPacientes?.ok ? paginaPacientes.data.total : 0;
  const conteoPorTab: Record<TabPacientes, number> = {
    todos: cTodos,
    verificados: cVerificados,
    sin_verificar: cSinVerificar,
  };
  const querySecundaria = q ? `&q=${encodeURIComponent(q)}` : "";
  // hrefBaseSinQ — para BuscadorEnVivo (TR-115): mismo tab vigente, sin
  // `q` (el componente lo agrega solo, con cada tecla).
  const hrefBaseSinQ = tab === "todos" ? "/panel/pacientes" : `/panel/pacientes?estado=${tab}`;

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
    // corrección 2026-08-24 — ver TR-029 en docs/Arquitectura y base/tradeoffs.md: "hay un
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
          pestañas abajo). Tabla sin cambios (mismo pedido explícito del
          cliente que en Turnos: "las tablas dejelas como estaba, no
          toque eso"). */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 max-md:w-full">
          {/* BuscadorEnVivo (TR-115, 2026-09-06) — reemplaza el `<form
              method="get">` de antes, mismo pedido que en Turnos: "que me
              vaya apareciendo resultados sin tocar enter". */}
          <div className="max-w-md flex-1 max-md:w-full max-md:max-w-none">
            <BuscadorEnVivo q={q} hrefBase={hrefBaseSinQ} placeholder="Nombre, apellido o DNI…" />
          </div>
          <AgregarPacienteButton />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Corrección de QA (segunda ronda, 2026-09-06, fotos
              "arreglar.png"/"referencia.png"): esta pestaña había vuelto
              a verse como el diseño viejo (fondo tenue sin borde,
              `bg-hueso` sin borde) — mismo criterio que Turnos
              (turnos/page.tsx): "pastilla" blanca (`bg-marfil` +
              `border-arena`) que envuelve las 3 pestañas, flotando sobre
              el fondo de la página. */}
          <nav aria-label="Filtrar por verificación" className="flex flex-wrap items-center gap-1 rounded-card border-[0.5px] border-arena bg-marfil p-1 text-sm md:rounded-full">
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
              : conteoPorTab.todos === 0
                ? "Todavía no hay pacientes cargados."
                : "No hay pacientes en esta pestaña."}
          </p>
        ) : (
          <PacientesTable pacientes={pacientesFiltrados} totalInicial={totalPacientes} filtros={filtros} />
        )}
      </div>
    </div>
  );
}
