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
    // p-8 → clamp() en mobile (rama fix/mobile, 2026-08-24, pedido
    // explícito del cliente: "escalá... paddings y espaciados con
    // clamp() usando vw, en vez de tamaños fijos en px") — 32px fijos de
    // margen a cada lado le comen ~17% del ancho útil a un teléfono
    // angosto (~375px); clamp(1rem,4vw,2rem) baja a ~15px en pantallas
    // chicas y nunca pasa de los 32px de escritorio (el máximo del
    // clamp() coincide con p-8, así que arriba de ~640px de viewport de
    // hecho da lo mismo). Ver TR-026 en docs/tradeoffs.md.
    <div className="flex flex-col gap-4 p-8 max-md:p-[clamp(1rem,4vw,2rem)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
          Calendario
        </h1>
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

      {/* Escritorio: altura fija (h-[600px]) + scroll interno propio en
          las dos direcciones — no estira la página, sin cambios acá.

          Mobile (rama fix/mobile, corrección 2026-08-24 — ver TR-026 en
          docs/tradeoffs.md): `max-md:h-auto max-md:overflow-y-visible`
          cancela el recorte vertical de escritorio — el scroll vertical
          de toda la sección ahora lo maneja `<main>` en
          app/panel/layout.tsx (un solo scroll de la página, no uno
          anidado adentro de otro), así que este cuadro simplemente
          fluye con su alto natural. El scroll horizontal SÍ se mantiene
          siempre (`overflow-x-auto`, escritorio y mobile por igual): la
          vista Semana (CalendarGrid) fuerza un piso de ancho por columna
          en mobile (ver ese componente), así que sigue haciendo falta
          para llegar a los días que no entran. WebkitOverflowScrolling:
          Tailwind no tiene una utilidad para esta propiedad, así que va
          inline — sin esto, el scroll horizontal por gesto táctil en
          iOS puede sentirse trabado en vez de con inercia nativa.
          `max-md:overscroll-contain` (corrección 2026-08-24 — ver TR-027
          en docs/tradeoffs.md): sin esto, arrastrar hasta el borde de
          este scroll horizontal podía disparar el rebote elástico del
          documento, que arrastraba visualmente al header/sidebar fijos
          — ver PanelScrollLock para la otra mitad del mismo arreglo. */}
      <div
        className="h-[600px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:h-auto max-md:overflow-y-visible max-md:overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
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
