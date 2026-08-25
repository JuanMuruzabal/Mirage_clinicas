"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
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

  // Rama fix/mobile, sexta corrección 2026-08-24 — ver TR-029 en
  // docs/tradeoffs.md (reemplaza el criterio de TR-028, que dejaba el
  // título/toolbar/calendario con anchos DISTINTOS según la vista — el
  // calendario en Día no tenía ningún min-width propio, más angosto que
  // el título/toolbar; en Semana era al revés, más ancho — pedido
  // explícito del cliente: "para que midan exactamente lo mismo en
  // todas las vistas"). El mínimo pasa a ser UNO SOLO por vista, en vez
  // de uno por fila — 640px es el piso (el mismo número de la
  // referencia del cliente para `.titulo-fila`/`.toolbar`, y lo que
  // necesita el toolbar para no partirse); la vista Semana puede pedir
  // más si tiene muchos días. Este único número se aplica a un wrapper
  // que envuelve título+toolbar+calendario (ver el `return` de abajo);
  // cada fila adentro usa `w-full` para medir siempre lo mismo que el
  // wrapper, nunca su propio mínimo independiente.
  const anchoMinPx = vista === "semana" ? Math.max(640, 64 + dias.length * 130) : 640;

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
      {/* Wrapper de ancho único (TR-029): título + toolbar + calendario
          comparten el mismo `min-width` — antes cada uno tenía el suyo
          y terminaban midiendo distinto según la vista. La var
          `--panel-cal-min-w` (calculada arriba) solo tiene efecto debajo
          de 768px (`.panel-cal-min-w` en globals.css). */}
      <div
        className="panel-cal-min-w flex flex-col gap-4 max-md:min-w-[var(--panel-cal-min-w)]"
        style={{ "--panel-cal-min-w": `${anchoMinPx}px` } as CSSProperties}
      >
        {/* max-md:justify-start (rama fix/mobile, undécima corrección
            2026-08-24 — ver TR-034 en docs/tradeoffs.md, pedido explícito
            del cliente: "el boton de generar turno debe estar al lado del
            texto calendario"). Con `justify-between` sobre una fila que
            mide 640px+ en mobile (el `min-width` del wrapper), el botón
            quedaba pegado al borde derecho de esa fila — fuera de la
            pantalla visible sin deslizar. `justify-start` (solo mobile)
            lo deja pegado al título, como en escritorio; escritorio sigue
            con `justify-between` (esa fila ahí sí entra completa en
            pantalla, separarlos se ve mejor). */}
        <div className="flex flex-wrap items-center justify-between gap-4 max-md:w-full max-md:flex-nowrap max-md:justify-start">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
            Calendario
          </h1>
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil shadow-soft hover:brightness-95 max-md:whitespace-nowrap"
          >
            + Agregar turno
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border-[0.5px] border-arena bg-marfil px-4 py-3 shadow-soft max-md:w-full max-md:flex-nowrap">
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

            Mobile (sexta corrección 2026-08-24 — ver TR-029 en
            docs/tradeoffs.md): este cuadro sigue sin scroll propio
            (`max-md:h-auto max-md:overflow-visible`, TR-028) — el ancho
            mínimo ya no es propio de esta card (`panel-cal-min-w` se
            movió al wrapper de arriba, TR-029), acá solo `w-full` para
            medir lo mismo que el wrapper y que título/toolbar/calendario
            no vuelvan a tener anchos distintos entre sí. */}
        <div
          className="h-[600px] overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft max-md:h-auto max-md:w-full max-md:overflow-visible"
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
