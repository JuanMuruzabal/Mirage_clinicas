"use client";

import { useEffect, useRef, useState } from "react";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { listTurnosAction } from "@/app/actions/turnos";
import {
  formatDiaLargo,
  formatMesAnio,
  formatRangoSemana,
  navegar,
  rangoVisible,
  diasDeVista,
  isSameDay,
  startOfDay,
  type VistaCalendario,
} from "@/lib/calendar-utils";
import { CalendarGrid, GUTTER_PX, COL_PX } from "./calendar-grid";
import { CalendarMonthGrid } from "./calendar-month-grid";
import { AgregarTurnoModal } from "./agregar-turno-modal";
import { TurnoDetalle } from "./turno-detalle";

interface CalendarViewProps {
  tiposConsulta: TipoConsulta[];
  turnosIniciales: Turno[];
  // "?vista=semana" desde la tarjeta "Turnos próximos" del dashboard
  // (pedido explícito del cliente, 2026-08-27) — sin esto, "Hoy" (día)
  // sigue siendo el default de siempre (2026-08-23).
  vistaInicial?: VistaCalendario;
}

// T2.3: toolbar prev/next/Hoy + toggle Mes/Semana/Día + contenedor de
// ALTURA FIJA con scroll interno propio (clave del pedido: "no estira la
// página"). T2.4/T2.5 viven acá adentro: el modal de agregar turno y el
// error controlado de solapamiento ya vienen resueltos por las Server
// Actions (app/actions/turnos.ts) — este componente solo muestra el error
// que le devuelvan.
export function CalendarView({ tiposConsulta, turnosIniciales, vistaInicial }: CalendarViewProps) {
  // Vista inicial "Hoy" (día) por default — pedido explícito del cliente
  // (2026-08-23): lo primero que se ve al entrar al calendario es el día
  // de hoy, no la semana. `vistaInicial` (2026-08-27) permite arrancar
  // directo en Semana cuando se llega desde la tarjeta "Turnos próximos"
  // del dashboard, sin tocar ese default para quien entra por el menú.
  const [vista, setVista] = useState<VistaCalendario>(vistaInicial ?? "dia");
  const [fecha, setFecha] = useState(() => new Date());
  const [turnos, setTurnos] = useState<Turno[]>(turnosIniciales);
  const [cargando, setCargando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<Turno | null>(null);

  // Rediseño 2026-08-27 (pedido explícito del cliente): scroll-to-hoy/
  // al-turno-más-próximo, exclusivo de la vista Semana (la única que
  // scrollea horizontal, ver CalendarGrid).
  // `scrollBoxRef` apunta a la caja que de verdad scrollea (más abajo en
  // el return) — CalendarGrid solo aporta la geometría de columnas
  // (GUTTER_PX/COL_PX), nunca controla su propio scroll (lo hace el
  // padre).
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  // Guarda de una sola vez para el scroll automático al montar (evita
  // reprogramarlo en cada re-render cuando `dias`/`turnos` cambian por
  // otros motivos — ver el efecto de abajo).
  const scrollInicialHecho = useRef(false);

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

  // scrollASemanaDeHoy — pedido explícito del cliente, 2026-08-27: "al
  // tocar en el apartado semana, me ubicara en el día que estoy y de ahí
  // desplazarme para delante o atrás... al tocar el hoy que vuelva a
  // estar al día de la fecha". Recibe los días YA calculados para la
  // fecha/vista de destino (no lee `dias`/`fecha` del cierre — evita
  // depender de un render que todavía no pasó) y deja el día de hoy
  // apenas empezando a la izquierda de lo visible (medio `COL_PX` de
  // aire antes, no pegado al borde), listo para deslizar hacia
  // adelante. Si la semana de destino no incluye hoy (se llega acá solo
  // desde el toggle "Semana" o el botón "Hoy", nunca desde ←/→), no
  // hace nada — no hay a dónde ubicarse.
  function scrollASemanaDeHoy(diasSemana: Date[]) {
    const box = scrollBoxRef.current;
    if (!box) return;
    const idx = diasSemana.findIndex((d) => isSameDay(d, new Date()));
    if (idx < 0) return;
    box.scrollTo({ left: Math.max(GUTTER_PX + idx * COL_PX - COL_PX / 2, 0), behavior: "smooth" });
  }

  // scrollADiaConTurnoMasProximo — pedido explícito del cliente,
  // 2026-08-27: "turnos próximos [en General] al calendario de semana
  // donde sea visible el primer turno más próximo". A diferencia de
  // `scrollASemanaDeHoy` (siempre hoy), busca el primer día desde hoy en
  // adelante (dentro de la semana ya cargada) que tenga al menos un
  // turno agendado — si hoy mismo tiene uno, se queda ahí igual. Sin
  // ningún turno futuro en la semana, cae en hoy (mismo comportamiento
  // de siempre).
  function scrollADiaConTurnoMasProximo(diasSemana: Date[], listaTurnos: Turno[]) {
    const box = scrollBoxRef.current;
    if (!box) return;
    const hoy = startOfDay(new Date());
    const diaConTurno = diasSemana
      .filter((d) => d.getTime() >= hoy.getTime())
      .find((d) => listaTurnos.some((t) => t.horaInicio && isSameDay(new Date(t.horaInicio), d)));
    const idx = diasSemana.findIndex((d) => isSameDay(d, diaConTurno ?? new Date()));
    if (idx < 0) return;
    box.scrollTo({ left: Math.max(GUTTER_PX + idx * COL_PX - COL_PX / 2, 0), behavior: "smooth" });
  }

  function cambiarVista(v: VistaCalendario) {
    setCargando(true);
    setVista(v);
    if (v === "semana") scrollASemanaDeHoy(diasDeVista(fecha, "semana"));
  }

  function irAHoy() {
    const hoy = new Date();
    setCargando(true);
    setFecha(hoy);
    if (vista === "semana") scrollASemanaDeHoy(diasDeVista(hoy, "semana"));
  }

  function recargar() {
    const { desde, hasta } = rangoVisible(fecha, vista);
    listTurnosAction({ estado: "agendado", desde: desde.toISOString(), hasta: hasta.toISOString() }).then(setTurnos);
  }

  const dias = diasDeVista(fecha, vista);
  const titulo = vista === "mes" ? formatMesAnio(fecha) : vista === "semana" ? formatRangoSemana(fecha) : formatDiaLargo(fecha);

  // Dispara una sola vez (guardado por `scrollInicialHecho`, no en un
  // array de deps vacío) — `turnosIniciales`/`vistaInicial` ya vienen
  // resueltos por el Server Component con el rango correcto, no hace
  // falta esperar ningún fetch de cliente para tener adónde scrollear;
  // la guarda evita que se repita cuando `dias`/`turnos` cambien después
  // por otro motivo (navegar semanas, refetch).
  useEffect(() => {
    if (vistaInicial !== "semana" || scrollInicialHecho.current) return;
    scrollInicialHecho.current = true;
    scrollADiaConTurnoMasProximo(dias, turnos);
  }, [vistaInicial, dias, turnos]);

  return (
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/tradeoffs.md: "hay un
    // espacio de más entre el header y donde arranca el scroll... quitá
    // el padding-top sobrante"). El padding lateral/inferior sigue en
    // clamp() (TR-026: "escalá... con clamp() usando vw"); el superior
    // se separa y baja a un valor chico y fijo — el que compensa la
    // altura del header ya lo da `pt-[var(--header-height)]` en
    // app/panel/layout.tsx (ese no se toca), este de acá era una
    // segunda capa de aire encima de esa, redundante en mobile.
    <div className="flex flex-col gap-4 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]">
      {/* Rediseño 2026-08-27 (pedido explícito del cliente: "encontrar
          una forma ingeniosa de manejar el calendario para las opciones
          de semana y mes sin necesidad de moverse horizontalmente por la
          página, sino moverse dentro del calendario... todo tiene que
          ser fijo en movimiento de la página en sí"). Reemplaza la clase
          `.panel-cal-min-w`/TR-029 (título + toolbar + calendario
          compartían un min-width fijo — hasta
          64+dias×130px en Semana — para forzar el scroll horizontal
          UNIFICADO de <main>, arrastrando toda la página de costado).
          Título y toolbar ya no fuerzan ningún ancho — envuelven
          (`flex-wrap`) como cualquier fila normal. El único que necesita
          moverse de costado en Semana (7 columnas + la franja de horas)
          es el calendario en sí — ESE contenido lleva su propio
          min-width (ver `CalendarGrid`/`anchoMinDias` más abajo) DENTRO
          de esta caja, que es la que scrollea sola (ver el div con
          `overflow-x-auto` unas líneas más abajo) — nunca la página. Mes
          no necesita nada de esto (7 columnas fluidas, sin overflow) y
          Día tampoco (una sola columna). */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
            Calendario
          </h1>
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil shadow-soft hover:brightness-95 whitespace-nowrap"
          >
            + Agregar turno
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border-[0.5px] border-arena bg-marfil px-4 py-3 shadow-soft">
          <div className="flex flex-wrap items-center gap-3">
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
              onClick={irAHoy}
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

        {/* Altura fija (h-[600px]) + scroll interno propio en las dos
            direcciones, sin condición de mobile (antes `max-md:h-auto
            max-md:overflow-visible`, TR-028, para que esta caja le
            cediera el scroll a `<main>`) — vuelve a ser su propio
            contenedor de scroll en cualquier ancho: Semana scrollea
            horizontal SOLO acá adentro (ver el min-width que le da
            CalendarGrid a su propio contenido, no a esta caja), Mes/Día
            no necesitan ningún scroll horizontal y no lo generan. */}
        <div
          ref={scrollBoxRef}
          className="relative h-[600px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft"
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
