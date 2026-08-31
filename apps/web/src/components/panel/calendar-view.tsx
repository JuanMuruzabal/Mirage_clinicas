"use client";

import { useEffect, useRef, useState } from "react";
import type { BloqueoHorario, TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { listTurnosAction } from "@/app/actions/turnos";
import { listBloqueosAction } from "@/app/actions/calendario-config";
import {
  formatDiaLargo,
  formatMesAnio,
  formatRangoSemana,
  navegar,
  rangoVisible,
  diasDeVista,
  isSameDay,
  startOfDay,
  hoyEnCordoba,
  type VistaCalendario,
} from "@/lib/calendar-utils";
import { CalendarGrid, GUTTER_PX, COL_PX } from "./calendar-grid";
import { CalendarMonthGrid } from "./calendar-month-grid";
import { AgregarTurnoModal } from "./agregar-turno-modal";
import { TurnoDetalle } from "./turno-detalle";
import { ConfiguracionCalendarioModal } from "./configuracion-calendario-modal";
import { BloqueoDetalleModal } from "./bloqueo-detalle-modal";
import { ReservarHorarioModal } from "./reservar-horario-modal";
import { IconSettings } from "@/components/icons";

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
  // hoyEnCordoba() (encontrado investigando un error de hidratación de
  // React, 2026-08-30), no `new Date()` — este estado se calcula tanto en
  // el server (SSR) como al hidratar en el cliente, y `new Date()` leído
  // con getters locales (getFullYear/getMonth/getDate, ver
  // calendar-utils.ts) puede caer en un día de calendario DISTINTO en
  // cada uno si sus timezones ambiente no coinciden (el container corre
  // en UTC; el navegador de cada visitante, en la suya) — mismatch de
  // hidratación, "sáb 29" (server) vs "dom 30" (cliente).
  const [fecha, setFecha] = useState(() => hoyEnCordoba());
  const [turnos, setTurnos] = useState<Turno[]>(turnosIniciales);
  const [cargando, setCargando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  // reservarHorarioAbierto — acceso rápido "+ Reservar horario" (pedido
  // explícito del cliente, 2026-09-04): "agregar un acceso rápido a
  // reservar horario desde la pantalla principal del calendario al lado
  // de agregar turno... sin ir al panel poder agregarlos por el acceso
  // rápido". Al guardar, recarga bloqueosGenerales/bloqueosEspecificas
  // (cargarConfigCalendario, más abajo) para que se vea en el grid al
  // toque, sin esperar a abrir/cerrar Configuración de calendario.
  const [reservarHorarioAbierto, setReservarHorarioAbierto] = useState(false);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<Turno | null>(null);
  // Botón de tuerca junto al título (F2.3, pedido explícito del cliente):
  // se despliega un menú de un solo ítem ("Configuración de calendario")
  // antes de abrir el modal — mismo patrón que HeaderConfigMenu
  // (click-outside cierra el menú, ver el efecto de más abajo).
  const [menuAjustesAbierto, setMenuAjustesAbierto] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(false);
  const menuAjustesRef = useRef<HTMLDivElement>(null);

  // F2.3.8: reglas de bloqueo, para que el grid (CalendarGrid) pinte los
  // tramos bloqueados. NO incluye el horario de atención en sí —
  // corrección de QA: "el horario de atención que no modifique cómo se
  // ve el calendario" (el rango de horas del grid queda fijo; el
  // horario de atención solo acota los selectores de hora al agendar un
  // turno, ver agregar-turno-modal.tsx/editar-turno-modal.tsx, que lo
  // piden por su cuenta). Se cargan al montar y se vuelven a pedir cada
  // vez que se cierra el modal de configuración (`cerrarConfig` más
  // abajo) — así el alta/baja de reglas se refleja apenas se sale, sin
  // depender de un callback por cada mutación posible del modal.
  const [bloqueosGenerales, setBloqueosGenerales] = useState<BloqueoHorario[]>([]);
  const [bloqueosEspecificas, setBloqueosEspecificas] = useState<BloqueoHorario[]>([]);
  // reglasSeleccionadas (corrección de QA, 2026-08-30, rediseñada
  // 2026-08-31 a una LISTA en vez de un bloqueo + "otra regla de abajo"):
  // un solo elemento para un tramo sin solapamiento, dos o más para un
  // tramo "combinado" — ver el comentario grande en calendar-grid.tsx
  // (bloqueosParaVisualizar) para la regla completa de solapamiento.
  const [reglasSeleccionadas, setReglasSeleccionadas] = useState<BloqueoHorario[] | null>(null);
  const [reglaAFocalizar, setReglaAFocalizar] = useState<string | null>(null);
  // turnosEnConflictoSeleccionados / reglasEnConflictoDelTurno — paso 2
  // (manejo de conflictos con turnos, 2026-09-04). El primero acompaña a
  // `reglasSeleccionadas`: los turnos del mismo cluster "conflicto" (ver
  // calendar-grid.tsx), vacío en cualquier tramo sin turnos involucrados.
  // El segundo solo se completa al pasar de ese modal combinado a
  // TurnoDetalle ("Ver turno" de una tarjeta en conflicto) — es lo que le
  // dice a TurnoDetalle que muestre el aviso de conflicto; un turno
  // abierto desde el grid normal (sin conflicto) lo deja vacío.
  const [turnosEnConflictoSeleccionados, setTurnosEnConflictoSeleccionados] = useState<Turno[]>([]);
  const [reglasEnConflictoDelTurno, setReglasEnConflictoDelTurno] = useState<BloqueoHorario[]>([]);

  function cargarConfigCalendario() {
    listBloqueosAction(false).then(setBloqueosGenerales);
    listBloqueosAction(true).then(setBloqueosEspecificas);
  }

  useEffect(() => {
    cargarConfigCalendario();
  }, []);

  function cerrarConfig() {
    setConfigAbierta(false);
    setReglaAFocalizar(null);
    cargarConfigCalendario();
  }

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
  // Día objetivo pendiente de scrollear en Semana (botón "Hoy"/toggle
  // "Semana") — bug reportado 2026-08-27, más visible en mobile: no se
  // puede scrollear en el mismo tick que se dispara el fetch, ver el
  // efecto de más abajo que lo resuelve recién cuando los datos llegan.
  const scrollPendienteRef = useRef<Date | null>(null);

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

  // scrollAlDia — pedido explícito del cliente, 2026-08-27: "al tocar en
  // el apartado semana, me ubicara en el día que estoy y de ahí
  // desplazarme para delante o atrás... al tocar el hoy que vuelva a
  // estar al día de la fecha". Recibe los días YA calculados para la
  // fecha/vista de destino (no lee `dias`/`fecha` del cierre — evita
  // depender de un render que todavía no pasó) y deja el día objetivo
  // apenas empezando a la izquierda de lo visible (medio `COL_PX` de
  // aire antes, no pegado al borde), listo para deslizar hacia
  // adelante. Si la semana de destino no incluye el día pedido, no hace
  // nada — no hay a dónde ubicarse.
  function scrollAlDia(diasSemana: Date[], objetivo: Date) {
    const box = scrollBoxRef.current;
    if (!box) return;
    const idx = diasSemana.findIndex((d) => isSameDay(d, objetivo));
    if (idx < 0) return;
    box.scrollTo({ left: Math.max(GUTTER_PX + idx * COL_PX - COL_PX / 2, 0), behavior: "smooth" });
  }

  function cambiarVista(v: VistaCalendario) {
    // Bug reportado 2026-08-27: "tocar 2 veces el botón lo traba" — sin
    // esta guarda, tocar la vista YA activa (ej. "Semana" estando en
    // Semana) igual disparaba `setCargando(true)`, pero `setVista(v)`
    // con el mismo valor que ya tenía es un no-op para React (bail out,
    // sin re-render) — el efecto que escucha `[fecha, vista]` nunca se
    // volvía a disparar para apagar el loading, quedando "Cargando…"
    // para siempre. `irA`/`irAHoy` no sufren esto porque `fecha` es un
    // objeto `Date` nuevo en cada llamada (siempre "cambia" para React,
    // aunque sea el mismo día) — acá `vista` es un string plano.
    if (v === vista) return;
    setCargando(true);
    setVista(v);
    // No se scrollea acá mismo — ver el efecto de abajo, guardado en
    // `scrollPendienteRef` hasta que `cargando` vuelva a `false`.
    if (v === "semana") scrollPendienteRef.current = hoyEnCordoba();
  }

  function irAHoy() {
    const hoy = hoyEnCordoba();
    setCargando(true);
    setFecha(hoy);
    if (vista === "semana") scrollPendienteRef.current = hoy;
  }

  function recargar() {
    const { desde, hasta } = rangoVisible(fecha, vista);
    listTurnosAction({ estado: "agendado", desde: desde.toISOString(), hasta: hasta.toISOString() }).then(setTurnos);
  }

  const dias = diasDeVista(fecha, vista);
  const titulo = vista === "mes" ? formatMesAnio(fecha) : vista === "semana" ? formatRangoSemana(fecha) : formatDiaLargo(fecha);

  // Resuelve el scroll pendiente de "Hoy"/toggle "Semana" (ver
  // `cambiarVista`/`irAHoy` de arriba). No puede dispararse en el mismo
  // tick que esos handlers: ahí `cargando` recién pasa a `true` y
  // CalendarGrid todavía no se montó (se ve el texto "Cargando…") — un
  // `scrollTo` sobre una caja sin contenido real no tiene adónde
  // moverse, así que quedaba "pegado" al inicio de la semana en vez de
  // avanzar hasta el día de hoy (bug reportado 2026-08-27, mucho más
  // visible en mobile: en desktop la semana completa suele entrar sin
  // necesitar scroll y el bug pasaba desapercibido). Recién acá,
  // cuando `cargando` vuelve a `false` (los datos ya llegaron y
  // CalendarGrid ya tiene contenido real), se ejecuta el scroll
  // guardado.
  useEffect(() => {
    if (cargando) return;
    const objetivo = scrollPendienteRef.current;
    if (!objetivo) return;
    scrollPendienteRef.current = null;
    scrollAlDia(dias, objetivo);
  }, [cargando, dias]);

  // Dispara una sola vez (guardado por `scrollInicialHecho`, no en un
  // array de deps vacío) — `turnosIniciales`/`vistaInicial` ya vienen
  // resueltos por el Server Component con el rango correcto, no hace
  // falta esperar ningún fetch de cliente para tener adónde scrollear;
  // la guarda evita que se repita cuando `dias`/`turnos` cambien después
  // por otro motivo (navegar semanas, refetch). Busca el primer día
  // desde hoy en adelante (dentro de la semana ya cargada) que tenga al
  // menos un turno agendado — pedido explícito del cliente, 2026-08-27:
  // "turnos próximos [en General] al calendario de semana donde sea
  // visible el primer turno más próximo" — si hoy mismo tiene uno, se
  // queda ahí igual; sin ningún turno futuro en la semana, cae en hoy.
  useEffect(() => {
    if (vistaInicial !== "semana" || scrollInicialHecho.current) return;
    scrollInicialHecho.current = true;
    const hoy = startOfDay(hoyEnCordoba());
    const diaConTurno = dias
      .filter((d) => d.getTime() >= hoy.getTime())
      .find((d) => turnos.some((t) => t.horaInicio && isSameDay(new Date(t.horaInicio), d)));
    scrollAlDia(dias, diaConTurno ?? hoyEnCordoba());
  }, [vistaInicial, dias, turnos]);

  useEffect(() => {
    if (!menuAjustesAbierto) return;
    function onClickOutside(event: MouseEvent) {
      if (menuAjustesRef.current && !menuAjustesRef.current.contains(event.target as Node)) {
        setMenuAjustesAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuAjustesAbierto]);

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
        {/* flex-col en mobile, flex-row desde md (corrección de QA:
            "en mobile el botón de agregar turno debe estar por debajo
            del título 'calendario' así el botón de configuración se
            despliega bien") — con las dos filas conviviendo en una sola
            fila angosta, el botón de tuerca no tenía margen propio para
            deslizarse sin chocar contra "+ Agregar turno"; apilar les da
            a los dos su propia fila completa. Sin cambios en escritorio
            (`md:flex-row`), donde sí entran cómodos lado a lado. */}
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]">
              Calendario
            </h1>
            {/* Botón de tuerca (F2.3, pedido explícito del cliente,
                corregido tras QA: "al tocarlo se debe deslizar hacia la
                derecha, y ahí mostrar configuración" — no un menú
                desplegable hacia abajo). Un solo botón con dos toques:
                el primero lo desliza para revelar el texto (`max-width`
                de 0 a un valor amplio, con `overflow-hidden` — mismo
                truco de "ícono que se expande en pastilla" de siempre,
                anima suave porque `max-width` sí es animable a
                diferencia de `width: auto`); el segundo toque (ya con el
                texto visible) abre el modal y el botón vuelve solo a su
                estado colapsado. */}
            <div ref={menuAjustesRef}>
              <button
                type="button"
                aria-expanded={menuAjustesAbierto}
                aria-label={menuAjustesAbierto ? "Abrir configuración de calendario" : "Ajustes del calendario"}
                onClick={() => {
                  if (menuAjustesAbierto) {
                    setMenuAjustesAbierto(false);
                    setConfigAbierta(true);
                  } else {
                    setMenuAjustesAbierto(true);
                  }
                }}
                className="flex h-9 items-center overflow-hidden rounded-full bg-salvia-oscuro text-marfil shadow-soft transition-colors hover:brightness-95"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
                  <IconSettings className="h-5 w-5" />
                </span>
                <span
                  className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-300 ease-in-out ${
                    menuAjustesAbierto ? "max-w-[16rem] pr-4 opacity-100" : "max-w-0 opacity-0"
                  }`}
                >
                  Configuración de calendario
                </span>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {/* Mismo verde que "+ Agregar turno" (corrección de QA,
                2026-09-04: "el botón de reservar horario, debe aparecer
                verde como el de agregar turno") — antes tenía un estilo
                secundario (borde, sin relleno) que lo hacía ver menos
                importante que el de agregar turno, cuando las dos son
                acciones de alta igual de directas desde acá. */}
            <button
              type="button"
              onClick={() => setReservarHorarioAbierto(true)}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil shadow-soft hover:brightness-95 whitespace-nowrap"
            >
              + Reservar horario
            </button>
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil shadow-soft hover:brightness-95 whitespace-nowrap"
            >
              + Agregar turno
            </button>
          </div>
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
            <CalendarGrid
              dias={dias}
              turnos={turnos}
              tiposConsulta={tiposConsulta}
              onTurnoClick={(turno) => {
                // Turno abierto desde el grid normal (nunca desde una
                // tarjeta en conflicto) — sin aviso de conflicto.
                setReglasEnConflictoDelTurno([]);
                setTurnoSeleccionado(turno);
              }}
              bloqueosGenerales={bloqueosGenerales}
              bloqueosEspecificas={bloqueosEspecificas}
              onBloqueoClick={(reglas, _dia, turnosEnConflicto) => {
                setReglasSeleccionadas(reglas);
                setTurnosEnConflictoSeleccionados(turnosEnConflicto ?? []);
              }}
            />
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

      {reservarHorarioAbierto && (
        <ReservarHorarioModal
          onClose={() => setReservarHorarioAbierto(false)}
          onGuardada={() => cargarConfigCalendario()}
        />
      )}

      {turnoSeleccionado && (
        <TurnoDetalle
          turno={turnoSeleccionado}
          tiposConsulta={tiposConsulta}
          enConflicto={reglasEnConflictoDelTurno.length > 0}
          onClose={() => {
            setTurnoSeleccionado(null);
            setReglasEnConflictoDelTurno([]);
          }}
        />
      )}

      {reglasSeleccionadas && (
        <BloqueoDetalleModal
          reglas={reglasSeleccionadas}
          turnos={turnosEnConflictoSeleccionados}
          tiposConsulta={tiposConsulta}
          onClose={() => {
            setReglasSeleccionadas(null);
            setTurnosEnConflictoSeleccionados([]);
          }}
          onVerRegla={(reglaId) => {
            setReglaAFocalizar(reglaId);
            setReglasSeleccionadas(null);
            setTurnosEnConflictoSeleccionados([]);
            setConfigAbierta(true);
          }}
          onVerTurno={(turno) => {
            // Pasa las reglas del cluster actual a TurnoDetalle, para que
            // muestre el aviso de conflicto — "abajo el mensaje turno en
            // conflicto con un horario reservado" (textual del cliente) —
            // pero solo si el turno TODAVÍA no se resolvió: uno que ya
            // pasó dejó de ser un conflicto activo (ver "Turnos
            // resueltos" en BloqueoDetalleModal), así que TurnoDetalle no
            // debe mostrar ese aviso ahí tampoco.
            const yaResuelto = Boolean(turno.horaFin) && new Date(turno.horaFin!).getTime() < Date.now();
            setReglasEnConflictoDelTurno(yaResuelto ? [] : (reglasSeleccionadas ?? []));
            setReglasSeleccionadas(null);
            setTurnosEnConflictoSeleccionados([]);
            setTurnoSeleccionado(turno);
          }}
          onEliminada={() => cargarConfigCalendario()}
        />
      )}

      {configAbierta && <ConfiguracionCalendarioModal onClose={cerrarConfig} reglaAFocalizarId={reglaAFocalizar ?? undefined} />}
    </div>
  );
}
