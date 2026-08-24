"use client";

import { useEffect, useState } from "react";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { listTurnosAction } from "@/app/actions/turnos";
import {
  formatDiaLargo,
  formatMesAnio,
  formatRangoSemana,
  navegar,
  rangoVisible,
  diasDeVista,
  type VistaCalendario,
} from "@/lib/calendar-utils";
import { CalendarGrid } from "./calendar-grid";
import { CalendarMonthGrid } from "./calendar-month-grid";
import { AgregarTurnoModal } from "./agregar-turno-modal";
import { TurnoDetalle } from "./turno-detalle";

interface CalendarViewProps {
  tiposConsulta: TipoConsulta[];
  turnosIniciales: Turno[];
}

// T2.3: toolbar prev/next/Hoy + toggle Mes/Semana/Día + contenedor de
// ALTURA FIJA con scroll interno propio (clave del pedido: "no estira la
// página"). T2.4/T2.5 viven acá adentro: el modal de agregar turno y el
// error controlado de solapamiento ya vienen resueltos por las Server
// Actions (app/actions/turnos.ts) — este componente solo muestra el error
// que le devuelvan.
export function CalendarView({ tiposConsulta, turnosIniciales }: CalendarViewProps) {
  // Vista inicial "Hoy" (día) — pedido explícito del cliente (2026-08-23):
  // lo primero que se ve al entrar al calendario es el día de hoy, no la
  // semana. El toolbar respeta el mismo orden progresivo (día → semana →
  // mes) más abajo.
  const [vista, setVista] = useState<VistaCalendario>("dia");
  const [fecha, setFecha] = useState(() => new Date());
  const [turnos, setTurnos] = useState<Turno[]>(turnosIniciales);
  const [cargando, setCargando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<Turno | null>(null);

  // setCargando(true) se dispara desde quien CAMBIA fecha/vista (los
  // handlers de abajo), no acá adentro — llamar setState de forma
  // síncrona al entrar a un efecto dispara renders en cascada
  // (react-hooks/set-state-in-effect); el efecto solo sincroniza con el
  // servidor y apaga el loading cuando la respuesta llega.
  useEffect(() => {
    const { desde, hasta } = rangoVisible(fecha, vista);
    let activo = true;
    listTurnosAction({ estado: "agendado", desde: desde.toISOString(), hasta: hasta.toISOString() }).then((data) => {
      if (activo) {
        setTurnos(data);
        setCargando(false);
      }
    });
    return () => {
      activo = false;
    };
  }, [fecha, vista]);

  function irA(nuevaFecha: Date, nuevaVista?: VistaCalendario) {
    setCargando(true);
    setFecha(nuevaFecha);
    if (nuevaVista) setVista(nuevaVista);
  }

  function cambiarVista(v: VistaCalendario) {
    setCargando(true);
    setVista(v);
  }

  function recargar() {
    const { desde, hasta } = rangoVisible(fecha, vista);
    listTurnosAction({ estado: "agendado", desde: desde.toISOString(), hasta: hasta.toISOString() }).then(setTurnos);
  }

  const dias = diasDeVista(fecha, vista);
  const titulo = vista === "mes" ? formatMesAnio(fecha) : vista === "semana" ? formatRangoSemana(fecha) : formatDiaLargo(fecha);

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Calendario</h1>
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil shadow-soft hover:brightness-95"
        >
          + Agregar turno
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border-[0.5px] border-arena bg-marfil px-4 py-3 shadow-soft">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => irA(navegar(fecha, vista, -1))}
            className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-sm text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => irA(new Date())}
            className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Hoy
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => irA(navegar(fecha, vista, 1))}
            className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-sm text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            →
          </button>
          <span className="ml-2 font-[family-name:var(--font-mono)] text-sm text-grafito">{titulo}</span>
        </div>

        <div className="flex rounded-full border-[0.5px] border-arena text-sm">
          {(["dia", "semana", "mes"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => cambiarVista(v)}
              className={`px-4 py-1.5 capitalize first:rounded-l-full last:rounded-r-full ${
                vista === v ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Altura fija + scroll interno propio — no estira la página. */}
      <div className="h-[600px] overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
        {cargando && <p className="p-4 text-sm text-grafito/60">Cargando…</p>}
        {!cargando && vista === "mes" && (
          <CalendarMonthGrid
            dias={dias}
            mesReferencia={fecha}
            turnos={turnos}
            tiposConsulta={tiposConsulta}
            onDiaClick={(dia) => irA(dia, "dia")}
          />
        )}
        {!cargando && vista !== "mes" && (
          <CalendarGrid dias={dias} turnos={turnos} tiposConsulta={tiposConsulta} onTurnoClick={setTurnoSeleccionado} />
        )}
      </div>

      {modalAbierto && (
        <AgregarTurnoModal
          tiposConsulta={tiposConsulta}
          onClose={() => setModalAbierto(false)}
          onSuccess={() => {
            setModalAbierto(false);
            recargar();
          }}
        />
      )}

      {turnoSeleccionado && (
        <TurnoDetalle turno={turnoSeleccionado} tiposConsulta={tiposConsulta} onClose={() => setTurnoSeleccionado(null)} />
      )}
    </div>
  );
}
