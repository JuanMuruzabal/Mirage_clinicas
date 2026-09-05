"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TipoConsulta } from "@dental-mirage/shared-types";
import { listTurnosAction } from "@/app/actions/turnos";
import { rangoRapidoFechas } from "@/lib/calendar-utils";
import { filtrosDeTab, RANGOS_RAPIDOS, type Tab } from "@/lib/turnos-filtros";
import { FiltrosSheet } from "./filtros-sheet";

interface TurnosFiltrosProps {
  tab: Tab;
  q?: string;
  tiposConsulta: TipoConsulta[];
  desde?: string;
  hasta?: string;
  tipoConsultaId?: string;
  verificacion?: "verificado" | "sin_verificar" | "";
}

// TurnosFiltros — corrección de QA (2026-09-06), pedido textual del
// cliente: "los filtros de búsqueda, en turnos... pasan a aparecer
// cuando se toca un botón... en vez de decir aplicar, aparezca 'ver X
// turnos'". Reemplaza la fila siempre visible de Tipo de
// consulta/Verificación/Desde-Hasta/Hoy-Semana-Mes/Aplicar/Limpiar que
// vivía en app/panel/turnos/page.tsx — las pestañas de estado y el
// buscador de texto quedan afuera, sin cambios (pedido explícito del
// cliente: "solo esa fila de filtros").
//
// A diferencia de PacienteTurnosTable (filtra en memoria, conteo
// síncrono), Turnos es Server Component + searchParams — el conteo en
// vivo del botón necesita pedirle al backend cuántos turnos matchean el
// borrador ANTES de confirmar nada, sin navegar todavía. Reusa
// listTurnosAction (la misma Server Action que ya usa TurnosTable para
// recargar) — debounced (300ms) para no disparar una request por cada
// tecla/cambio de select.
export function TurnosFiltros({ tab, q, tiposConsulta, desde, hasta, tipoConsultaId, verificacion }: TurnosFiltrosProps) {
  const router = useRouter();

  const [draftDesde, setDraftDesde] = useState(desde ?? "");
  const [draftHasta, setDraftHasta] = useState(hasta ?? "");
  const [draftTipoConsultaId, setDraftTipoConsultaId] = useState(tipoConsultaId ?? "");
  const [draftVerificacion, setDraftVerificacion] = useState(verificacion ?? "");

  const [conteo, setConteo] = useState<number | null>(null);
  // contadorPedido — evita que una respuesta vieja (request lenta,
  // llegada después de una más nueva) pise el conteo correcto — mismo
  // criterio de "última respuesta gana" que cualquier fetch en efecto con
  // dependencias que cambian rápido.
  const contadorPedido = useRef(0);

  useEffect(() => {
    const idPedido = ++contadorPedido.current;
    const timer = setTimeout(() => {
      const filtros = filtrosDeTab(
        tab,
        q,
        draftDesde || undefined,
        draftHasta || undefined,
        draftTipoConsultaId || undefined,
        draftVerificacion || undefined,
      );
      listTurnosAction(filtros).then((turnos) => {
        if (idPedido === contadorPedido.current) setConteo(turnos.length);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [tab, q, draftDesde, draftHasta, draftTipoConsultaId, draftVerificacion]);

  const hayFiltrosActivos = Boolean(desde || hasta || tipoConsultaId || verificacion);

  function abrirFiltros() {
    setDraftDesde(desde ?? "");
    setDraftHasta(hasta ?? "");
    setDraftTipoConsultaId(tipoConsultaId ?? "");
    setDraftVerificacion(verificacion ?? "");
  }

  function limpiarBorrador() {
    setDraftDesde("");
    setDraftHasta("");
    setDraftTipoConsultaId("");
    setDraftVerificacion("");
  }

  function aplicarFiltros() {
    const params = new URLSearchParams({ estado: tab });
    if (q) params.set("q", q);
    if (draftDesde) params.set("desde", draftDesde);
    if (draftHasta) params.set("hasta", draftHasta);
    if (draftTipoConsultaId) params.set("tipoConsultaId", draftTipoConsultaId);
    if (draftVerificacion) params.set("verificacion", draftVerificacion);
    router.push(`/panel/turnos?${params.toString()}`);
  }

  const aplicarLabel = conteo === null ? "Ver turnos…" : `Ver ${conteo} turno${conteo === 1 ? "" : "s"}`;

  return (
    <FiltrosSheet activo={hayFiltrosActivos} aplicarLabel={aplicarLabel} onAplicar={aplicarFiltros} onLimpiar={limpiarBorrador} onAbrir={abrirFiltros}>
      {tiposConsulta.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-grafito">Tipo de consulta</span>
          <select
            value={draftTipoConsultaId}
            onChange={(e) => setDraftTipoConsultaId(e.target.value)}
            className="rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia"
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

      {/* verificacion (corrección de seguridad, Fase 2.4.1) — le da al
          profesional una forma rápida de encontrar turnos de pacientes
          que todavía no demostraron ser reales, sin abrir ficha por
          ficha. */}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-grafito">Verificación</span>
        <select
          value={draftVerificacion}
          onChange={(e) => setDraftVerificacion(e.target.value as "" | "verificado" | "sin_verificar")}
          className="rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia"
        >
          <option value="">Todos</option>
          <option value="sin_verificar">Sin verificar</option>
          <option value="verificado">Verificados</option>
        </select>
      </label>

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
  );
}
