"use client";

import { useMemo, useState } from "react";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { ESTADO_CLASS, ESTADO_LABEL, formatFechaHora, temaTipoConsulta } from "@/lib/turno-format";
import { rangoRapidoFechas, type RangoRapido } from "@/lib/calendar-utils";
import { textoEsLargo, tipoConsultaNombreEsLargo } from "@/lib/texto-largo";
import { QuadrantMark } from "../quadrant-mark";
import { VerTextoBoton } from "../ver-texto-boton";
import { ClickableTableRow } from "./clickable-table-row";
import { FiltrosSheet } from "./filtros-sheet";

// aplicaFiltro — extraída para poder aplicarse dos veces: contra el
// estado YA CONFIRMADO (la tabla de abajo) y contra el estado BORRADOR
// (el conteo en vivo del botón "Ver X turnos" de FiltrosSheet, mientras
// la hoja sigue abierta y todavía no se confirmó nada).
function aplicaFiltro(t: Turno, tipoId: string, desde: string, hasta: string): boolean {
  if (tipoId !== "todos" && t.tipoConsultaId !== tipoId) return false;
  if (!t.horaInicio) return desde === "" && hasta === "";
  const fecha = t.horaInicio.slice(0, 10);
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

// RANGOS_RAPIDOS — Extra 2.3.3 (E3.5): mismo atajo HOY/SEMANA/MES que
// app/panel/turnos/page.tsx, acá aplicado al estado de cliente
// (desde/hasta) en vez de a la URL — esta tabla ya filtraba puramente del
// lado del cliente sobre los turnos ya traídos con la ficha del paciente.
const RANGOS_RAPIDOS: { label: string; rango: RangoRapido }[] = [
  { label: "Hoy", rango: "hoy" },
  { label: "Semana", rango: "semana" },
  { label: "Mes", rango: "mes" },
];

interface PacienteTurnosTableProps {
  turnos: Turno[];
  tiposConsulta: TipoConsulta[];
  vacio: string;
  // mostrarRangosRapidos (corrección de QA, pedido explícito del
  // cliente) — los atajos HOY/SEMANA/MES tienen poco sentido en
  // "Historial de turnos" (son turnos ya pasados por definición; "Hoy"
  // ahí casi siempre da vacío) — se sacan SOLO de ese lugar, Desde/Hasta
  // sigue disponible en los dos. Default `true`: "Turnos activos" (el
  // otro consumidor de este componente) los mantiene sin tocar nada.
  mostrarRangosRapidos?: boolean;
}

// PacienteTurnosTable (T3.6, pedido explícito del cliente 2026-08-23) —
// mismo formato de tabla que TurnosTable/la lista de Pacientes, para
// "Turnos activos" e "Historial de turnos" de la ficha del paciente.
// Diferenciación por tipo de consulta doble: un punto de color al
// principio de la fila (igual criterio que los puntos de la vista Mes del
// calendario) + una columna de texto con el nombre — ninguno de los dos
// solo, para que sea legible tanto de un vistazo como accesible (el color
// solo no alcanza). Sin acciones (Editar/Cancelar/Confirmar): es un
// historial de lectura, esas acciones viven en la vista Turnos.
//
// Filtros por tipo de consulta y rango de fecha (pedido explícito del
// cliente, 2026-08-23: "poder agregar filtros para encontrar con
// facilidad los turnos activos e historial") — puramente del lado del
// cliente, sobre los turnos ya traídos con la ficha del paciente (no hay
// necesidad de otro viaje al backend, esta lista ya es acotada a un solo
// paciente).
export function PacienteTurnosTable({ turnos, tiposConsulta, vacio, mostrarRangosRapidos = true }: PacienteTurnosTableProps) {
  // Confirmado — lo que de verdad filtra la tabla de abajo.
  const [tipoId, setTipoId] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  // Borrador — lo que se edita DENTRO de la hoja de filtros (corrección de
  // QA, 2026-09-06: "en vez de decir aplicar, aparezca 'ver X turnos'").
  // Arranca igual al confirmado y se resetea a eso mismo cada vez que la
  // hoja se abre (`onAbrir`, ver más abajo) — nunca arrastra un borrador
  // sin confirmar de la vez anterior.
  const [draftTipoId, setDraftTipoId] = useState(tipoId);
  const [draftDesde, setDraftDesde] = useState(desde);
  const [draftHasta, setDraftHasta] = useState(hasta);

  const tipoPorId = useMemo(() => new Map(tiposConsulta.map((t) => [t.id, t])), [tiposConsulta]);
  const tiposUsados = useMemo(() => {
    const ids = new Set(turnos.map((t) => t.tipoConsultaId).filter((id): id is string => Boolean(id)));
    return tiposConsulta.filter((t) => ids.has(t.id));
  }, [turnos, tiposConsulta]);

  const filtrados = useMemo(() => turnos.filter((t) => aplicaFiltro(t, tipoId, desde, hasta)), [turnos, tipoId, desde, hasta]);
  // draftFiltrados — puramente para el conteo en vivo del botón de la
  // hoja ("Ver X turnos"); la tabla real sigue mostrando `filtrados`
  // (confirmado) hasta que se toca ese botón.
  const draftFiltrados = useMemo(
    () => turnos.filter((t) => aplicaFiltro(t, draftTipoId, draftDesde, draftHasta)),
    [turnos, draftTipoId, draftDesde, draftHasta],
  );

  const hayFiltrosActivos = tipoId !== "todos" || desde !== "" || hasta !== "";
  const hayBorradorActivo = draftTipoId !== "todos" || draftDesde !== "" || draftHasta !== "";

  function abrirFiltros() {
    setDraftTipoId(tipoId);
    setDraftDesde(desde);
    setDraftHasta(hasta);
  }

  function aplicarFiltros() {
    setTipoId(draftTipoId);
    setDesde(draftDesde);
    setHasta(draftHasta);
  }

  function limpiarBorrador() {
    setDraftTipoId("todos");
    setDraftDesde("");
    setDraftHasta("");
  }

  if (turnos.length === 0) {
    return (
      <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">{vacio}</p>
    );
  }

  return (
    // Rediseño 2026-08-27 (pedido explícito del cliente, reemplaza el
    // intento de cards apiladas) — "quiero que
    // las tablas... funcionen de la misma forma que en escritorio").
    // Reemplaza el criterio de TR-030/067 (esta fila de filtros y la
    // tabla compartían un min-width fijo — 600px — para forzar el
    // scroll horizontal unificado de <main>): sigue siendo LA MISMA
    // tabla en mobile y escritorio (ver más abajo, columnas reducidas),
    // ya no hace falta ningún ancho forzado acá — los filtros vuelven a
    // envolver (`flex-wrap`) normalmente en vez de quedar apretados en
    // una sola fila. Cero cambio en escritorio.
    <div className="flex flex-col gap-3">
      {/* Corrección de QA (2026-09-06), pedido textual del cliente: "los
          filtros de búsqueda... pasan a aparecer cuando se toca un
          botón... bottom sheet en mobile... en vez de decir aplicar,
          aparezca 'ver X turnos'". Reemplaza la fila siempre visible de
          Tipo/Hoy-Semana-Mes/Desde-Hasta/Limpiar por este botón — el
          conteo del botón usa `draftFiltrados` (los valores todavía sin
          confirmar), la tabla de abajo sigue mostrando `filtrados`
          (confirmado) hasta que se toca "Ver X turnos". */}
      <div>
        <FiltrosSheet
          activo={hayFiltrosActivos}
          aplicarLabel={`Ver ${draftFiltrados.length} turno${draftFiltrados.length === 1 ? "" : "s"}`}
          onAplicar={aplicarFiltros}
          onLimpiar={hayBorradorActivo ? limpiarBorrador : undefined}
          onAbrir={abrirFiltros}
        >
          {tiposUsados.length > 0 && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-grafito">Tipo de consulta</span>
              <select
                value={draftTipoId}
                onChange={(e) => setDraftTipoId(e.target.value)}
                className="rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia"
              >
                <option value="todos">Todos los tipos</option>
                {tiposUsados.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* Extra 2.3.3 (E3.5): atajos HOY/SEMANA/MES antes de
              Desde/Hasta — precargan las dos fechas de una, en vez de
              obligar a elegirlas a mano para el caso común. Se sacan de
              "Historial de turnos" a pedido del cliente
              (mostrarRangosRapidos = false ahí): son turnos ya pasados
              por definición, "Hoy" no tiene sentido en ese contexto. */}
          {mostrarRangosRapidos && (
            <div className="flex flex-wrap gap-2">
              {RANGOS_RAPIDOS.map((r) => {
                const calculado = rangoRapidoFechas(r.rango);
                const activo = draftDesde === calculado.desde && draftHasta === calculado.hasta;
                return (
                  <button
                    key={r.rango}
                    type="button"
                    onClick={() => {
                      setDraftDesde(calculado.desde);
                      setDraftHasta(calculado.hasta);
                    }}
                    className={`rounded-full bg-salvia-oscuro px-3 py-1.5 text-xs font-semibold text-marfil hover:brightness-95 whitespace-nowrap ${activo ? "ring-2 ring-offset-1 ring-salvia-oscuro" : ""}`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-grafito">Desde</span>
              <input
                type="date"
                value={draftDesde}
                onChange={(e) => setDraftDesde(e.target.value)}
                className="rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-grafito">Hasta</span>
              <input
                type="date"
                value={draftHasta}
                onChange={(e) => setDraftHasta(e.target.value)}
                className="rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia"
              />
            </label>
          </div>
        </FiltrosSheet>
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
          Ningún turno coincide con el filtro.
        </p>
      ) : (
        // Misma tabla en mobile y escritorio — Motivo pasa a
        // `max-md:hidden` (columna menos esencial para un vistazo, sigue
        // disponible al entrar al turno en la vista Turnos). `max-h-[400px]
        // overflow-y-auto` en escritorio, `max-md:max-h-[18rem]
        // max-md:overflow-x-hidden` en mobile (pedido explícito del
        // cliente, 2026-08-27: "solo habrá 4 visibles a primera vista"/
        // "que se pueda desplazar solo verticalmente") — esta caja saca
        // su propia scrollbar vertical (`.panel-table-scroll`, ver
        // globals.css) con un historial largo, en vez de alargar la
        // página (mismo criterio que turnos-table.tsx/pacientes/page.tsx).
        <div className="panel-table-scroll max-h-[400px] overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-[18rem] max-md:overflow-x-hidden md:overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              {/* border-b (1px) en mobile — pedido explícito del cliente,
                  2026-08-27: separadores más claros, el 0.5px de
                  escritorio se pierde en algunos anchos de píxel de
                  mobile. Sticky por `th` (`.panel-th-sticky`, ver
                  globals.css), no en thead/tr — bug de Safari de iOS
                  con rebote elástico (2026-08-28). */}
              <tr className="border-b border-arena text-xs font-semibold uppercase tracking-wide text-grafito/60 md:border-b-[0.5px]">
                <th className="panel-th-sticky w-8 px-4 py-3" aria-hidden="true" />
                <th className="panel-th-sticky px-4 py-3">Tipo de consulta</th>
                <th className="panel-th-sticky px-4 py-3">Fecha y hora</th>
                <th className="panel-th-sticky px-4 py-3">Estado</th>
                <th className="panel-th-sticky max-md:hidden px-4 py-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => {
                const tipo = t.tipoConsultaId ? tipoPorId.get(t.tipoConsultaId) : undefined;
                // resuelto: mismo criterio derivado que TurnosTable/
                // TurnoDetalle (TR-074 en docs/tradeoffs.md) — no es un
                // estado real, agendado + horaFin ya pasado.
                const resuelto = t.estado === "agendado" && Boolean(t.horaFin) && new Date(t.horaFin!).getTime() < new Date().getTime();
                // Ir al turno en la vista Turnos (TR-074, pedido explícito
                // del cliente: "tocando el turno activo me debería
                // redirigir al turno en el apartado de turnos, de la
                // misma forma que se hace cuando toco el cuadrito en el
                // calendario") — mismo patrón que TurnoDetalle/
                // hrefVerTurno: esa fila arranca ya desplegada (`?turno=`,
                // ver TurnosTable/abrirId). `resuelto ? "resuelto" :
                // t.estado` (TR-076 en docs/tradeoffs.md): un turno
                // resuelto tiene que abrir la pestaña "Resueltos", no
                // "Confirmadas" — turnos/page.tsx trata "resuelto" como
                // su propio pseudo-valor de `estado` en la URL, no el
                // `estado` real del turno ("agendado").
                const hrefVerTurno = `/panel/turnos?estado=${resuelto ? "resuelto" : t.estado}&q=${encodeURIComponent(t.dniContacto)}&turno=${t.id}`;
                return (
                  <ClickableTableRow key={t.id} href={hrefVerTurno} className="border-b border-arena last:border-b-0 hover:bg-arena md:border-b-[0.5px]">
                    <td className="px-4 py-3">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: temaTipoConsulta(tipo).acento }}
                      />
                    </td>
                    <td className="px-4 py-3 text-grafito">
                      {/* Corrección de QA (pedido textual del cliente):
                          "si el tipo de consulta es muy largo... poner
                          un botón 'Ver tipo'" — mismo componente/umbral
                          que ya aplica en TurnosTable (tipoConsultaNombreEsLargo,
                          más largo que "Consulta general"). El punto de
                          color de la columna de al lado se sigue viendo
                          siempre, sea cual sea el nombre. */}
                      {tipo && tipoConsultaNombreEsLargo(tipo.nombre) ? <VerTextoBoton titulo="Tipo" texto={tipo.nombre} flecha /> : (tipo?.nombre ?? "—")}
                    </td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{formatFechaHora(t.horaInicio)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex flex-wrap items-center gap-2 text-xs ${resuelto ? "font-semibold text-grafito/60" : ESTADO_CLASS[t.estado]}`}>
                        <QuadrantMark estado={t.estado} />
                        {resuelto ? "Resuelto" : ESTADO_LABEL[t.estado]}
                        {/* Corrección de QA: "en la ficha de pacientes en
                            historial de turnos si el turno fue ausente o
                            asistió, ya que no hay referencia visual de
                            esto" — mismo criterio de color que
                            TurnosTable/TurnoDetalle/calendar-grid.tsx. */}
                        {resuelto && t.asistencia && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              t.asistencia === "asistio" ? "bg-salvia-oscuro text-marfil" : "bg-terracota-oscuro text-marfil"
                            }`}
                          >
                            {t.asistencia === "asistio" ? "Asistió" : "Ausente"}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="max-md:hidden px-4 py-3 text-grafito/60">
                      {/* Corrección de QA: mismo "Ver motivo" que ya
                          aplica en TurnosTable (Extra 2.3.3/E3.3) — acá
                          faltaba, tanto en "Turnos activos" como en
                          "Historial de turnos" (mismo componente). */}
                      {textoEsLargo(t.motivo) ? <VerTextoBoton titulo="Motivo de consulta" texto={t.motivo} /> : t.motivo || "—"}
                    </td>
                  </ClickableTableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
