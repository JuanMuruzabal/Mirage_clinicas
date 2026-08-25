"use client";

import { useMemo, useState } from "react";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { ESTADO_CLASS, ESTADO_LABEL, formatFechaHora, temaTipoConsulta } from "@/lib/turno-format";
import { QuadrantMark } from "../quadrant-mark";

interface PacienteTurnosTableProps {
  turnos: Turno[];
  tiposConsulta: TipoConsulta[];
  vacio: string;
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
export function PacienteTurnosTable({ turnos, tiposConsulta, vacio }: PacienteTurnosTableProps) {
  const [tipoId, setTipoId] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const tipoPorId = useMemo(() => new Map(tiposConsulta.map((t) => [t.id, t])), [tiposConsulta]);
  const tiposUsados = useMemo(() => {
    const ids = new Set(turnos.map((t) => t.tipoConsultaId).filter((id): id is string => Boolean(id)));
    return tiposConsulta.filter((t) => ids.has(t.id));
  }, [turnos, tiposConsulta]);

  const filtrados = useMemo(() => {
    return turnos.filter((t) => {
      if (tipoId !== "todos" && t.tipoConsultaId !== tipoId) return false;
      if (!t.horaInicio) return desde === "" && hasta === "";
      const fecha = t.horaInicio.slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return true;
    });
  }, [turnos, tipoId, desde, hasta]);

  const hayFiltrosActivos = tipoId !== "todos" || desde !== "" || hasta !== "";

  if (turnos.length === 0) {
    return (
      <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">{vacio}</p>
    );
  }

  return (
    // max-md:min-w (rama fix/mobile, séptima corrección 2026-08-24 — ver
    // TR-030 en docs/tradeoffs.md, mismo criterio que calendar-view.tsx/
    // turnos/page.tsx: filtros y tabla comparten UN SOLO min-width en vez
    // de tener cada uno el suyo — 35rem = 560px, el mínimo que ya tenía
    // la tabla). Con `w-full` en la fila de filtros (abajo) y en el
    // contenedor de la tabla, ambos miden siempre lo mismo.
    <div className="flex flex-col gap-3 max-md:min-w-[35rem]">
      <div className="flex flex-wrap items-center gap-2 text-sm max-md:w-full max-md:flex-nowrap">
        {tiposUsados.length > 0 && (
          <select
            value={tipoId}
            onChange={(e) => setTipoId(e.target.value)}
            aria-label="Filtrar por tipo de consulta"
            className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs text-grafito outline-none focus:border-salvia"
          >
            <option value="todos">Todos los tipos</option>
            {tiposUsados.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-grafito/60">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs text-grafito outline-none focus:border-salvia"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-grafito/60">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs text-grafito outline-none focus:border-salvia"
          />
        </label>
        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={() => {
              setTipoId("todos");
              setDesde("");
              setHasta("");
            }}
            className="text-xs font-medium text-salvia-oscuro hover:text-grafito"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-card border-[0.5px] border-arena bg-marfil p-8 text-center text-sm text-grafito/60 shadow-soft">
          Ningún turno coincide con el filtro.
        </p>
      ) : (
        // min-w-[560px] es un mínimo de contenido real, sin cambios.
        // Mobile (quinta corrección 2026-08-24 — ver TR-028 en
        // docs/tradeoffs.md): esta caja deja de tener su propio scroll
        // (max-md:overflow-visible) — comparte el de <main> en
        // app/panel/layout.tsx con el resto de la página del paciente.
        <div
          className="max-h-[400px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:max-h-none max-md:w-full max-md:overflow-visible"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b-[0.5px] border-arena bg-marfil text-xs font-semibold uppercase tracking-wide text-grafito/60">
                <th className="w-8 px-4 py-3" aria-hidden="true" />
                <th className="px-4 py-3">Tipo de consulta</th>
                <th className="px-4 py-3">Fecha y hora</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => {
                const tipo = t.tipoConsultaId ? tipoPorId.get(t.tipoConsultaId) : undefined;
                return (
                  <tr key={t.id} className="border-b-[0.5px] border-arena last:border-b-0">
                    <td className="px-4 py-3">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: temaTipoConsulta(tipo).acento }}
                      />
                    </td>
                    <td className="px-4 py-3 text-grafito">{tipo?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-grafito">{formatFechaHora(t.horaInicio)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-2 text-xs ${ESTADO_CLASS[t.estado]}`}>
                        <QuadrantMark estado={t.estado} />
                        {ESTADO_LABEL[t.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-grafito/60">{t.motivo || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
