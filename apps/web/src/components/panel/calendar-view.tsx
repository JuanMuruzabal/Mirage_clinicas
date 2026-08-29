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
import { CalendarRotationContext } from "@/lib/calendar-rotation-context";
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
  // F2.2 (docs/implementation-plan.md §11, pedido explícito del cliente,
  // 2026-08-29: "el botón... pondrá la pantalla de calendario en
  // horizontal... sería como una miniversión de cómo se ve en PC" — SIN
  // agrandar columnas/letras, el celular sigue en la mano en vertical).
  // Es el truco clásico de "horizontal sin rotar el teléfono": rotar el
  // contenedor 90° por CSS (ver el JSX de más abajo) en vez de depender
  // de la Screen Orientation API — esa API necesita fullscreen real para
  // poder bloquear la orientación, y iOS Safari no la soporta fuera de
  // una PWA instalada (justo el navegador que usa el cliente para
  // probar). Solo mobile (`md:hidden` en el propio overlay) — en
  // escritorio no tiene sentido.
  const [modoHorizontal, setModoHorizontal] = useState(false);

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
    if (v === "semana") scrollPendienteRef.current = new Date();
  }

  function irAHoy() {
    const hoy = new Date();
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
    const hoy = startOfDay(new Date());
    const diaConTurno = dias
      .filter((d) => d.getTime() >= hoy.getTime())
      .find((d) => turnos.some((t) => t.horaInicio && isSameDay(new Date(t.horaInicio), d)));
    scrollAlDia(dias, diaConTurno ?? new Date());
  }, [vistaInicial, dias, turnos]);

  // Toolbar y caja del calendario extraídas a variables (F2.2) — el
  // mismo JSX se usa en modo normal Y en modo horizontal (un solo
  // contenedor persistente, ver el `return` de más abajo), así que
  // separarlas evita escribir la lógica/las clases dos veces.
  const toolbar = (
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

      <div className="flex items-center gap-3">
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
        {/* Un solo botón, no dos (F2.2, corrección de QA 2026-08-29:
            "en vez de poner un botón salir, que donde diga horizontal,
            una vez estando en horizontal, diga vertical") — mismo
            toggle, cambia de nombre/ícono según el estado actual. Solo
            mobile — en escritorio no aplica (`md:hidden`). */}
        <button
          type="button"
          onClick={() => setModoHorizontal((actual) => !actual)}
          aria-label={modoHorizontal ? "Volver a la vista vertical" : "Ver el calendario en horizontal"}
          className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-sm text-grafito hover:border-salvia hover:text-salvia-oscuro md:hidden"
        >
          {modoHorizontal ? "⤡ Vertical" : "⤢ Horizontal"}
        </button>
      </div>
    </div>
  );

  const cajaCalendario = (
    <div
      ref={scrollBoxRef}
      // `h-full` en modo horizontal (F2.2, no `h-[600px]` fijo): ahí el
      // espacio vertical disponible es el ANCHO real del teléfono
      // (~375-430px, mucho menos que 600px) — el `min-h-0 flex-1` del
      // wrapper que la envuelve (ver el JSX de más abajo) le da su alto
      // real, y esta caja lo llena entero en vez de forzar 600px fijos
      // que se saldrían de la pantalla rotada.
      //
      // Ya NO lleva `style={{ WebkitOverflowScrolling: "touch" }}` (bug
      // reportado 2026-08-29, persiste tras separar `fixed`/`transform`
      // en dos elementos — ver el comentario grande más abajo): esta
      // caja queda anidada dentro de un ancestro con `transform`
      // (la rotación) que además tiene `transition-transform` PERMANENTE
      // — exactamente la combinación que `panel-shell.tsx` ya documentó
      // como disparador de bugs de touch en WebKit ("declararla
      // explícitamente es justamente lo que dispara este tipo de bug").
      // Vestigial desde iOS 13 (el scroll con inercia ya es nativo para
      // `overflow: auto`) — sacarla no cuesta nada y elimina una fuente
      // más de compositing raro en la rama rotada.
      className={`relative overflow-x-auto overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft ${
        modoHorizontal ? "h-full" : "h-[600px]"
      }`}
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
  );

  return (
    // CalendarRotationContext (F2.2): le avisa a ModalPortal (que monta
    // los modales de turno afuera de este árbol, en `document.body`) si
    // tiene que rotarse igual que el calendario — ver modal-portal.tsx.
    <CalendarRotationContext.Provider value={modoHorizontal}>
      {/* Bug reportado 2026-08-29: "los botones desde el modo horizontal
          no estarían funcionando, los toco y no me muestran nada" —
          WebKit/iOS tiene un bug documentado con `position: fixed` +
          `transform` en el MISMO elemento: se ve bien, pero el toque no
          se registra donde corresponde (el hit-testing no sigue
          correctamente el elemento ya rotado). La versión anterior
          combinaba las dos cosas en un solo `<div>` — acá se separan en
          dos: el de AFUERA es `fixed` (fija contra el viewport real) y
          NUNCA lleva transform; el de ADENTRO lleva el transform (y la
          animación) pero nunca es `fixed` (es `absolute`, relativo al
          de afuera). Ningún elemento combina las dos cosas a la vez.

          El de adentro sigue siendo el mismo contenedor PERSISTENTE
          entre los dos modos (F2.2, corrección de QA: "aplicar una
          animación de transición limpia") — antes eran dos árboles de
          JSX alternados con un ternary (se desmontaba uno y se montaba
          el otro), lo que hacía imposible animar la transición: CSS no
          puede interpolar entre un elemento que desaparece y otro que
          aparece, solo entre dos VALORES de una misma propiedad en el
          MISMO elemento. `transition-transform` anima el único valor
          que realmente cambia entre modos (`transform`); ancho/alto/
          posición cambian sin transición propia, pero el giro en sí
          queda suave en las dos direcciones (entrar y salir).

          Rotación de 90° por CSS = "horizontal sin rotar el teléfono"
          (F2.2, pedido explícito del cliente: "una miniversión de cómo
          se ve en PC", sin agrandar columnas/letras). El truco: dibujar
          el contenedor de adentro con el ANCHO/ALTO del teléfono ya
          intercambiados (`100vh`×`100vw`) y recién ahí rotarlo — rotar
          algo que todavía tiene las proporciones originales lo deja con
          franjas vacías a los costados en vez de ocupar toda la
          pantalla. `transform-origin: top left` + `translateY(-100%)`:
          sin el translate, la rotación deja el contenido fuera de
          pantalla (rota sobre su propia esquina, que después de rotar
          termina apuntando para otro lado) — el translate lo reubica
          para que ocupe justo el área visible del teléfono, de punta a
          punta. */}
      <div className={modoHorizontal ? "fixed inset-0 z-50 overflow-hidden bg-hueso" : "contents"}>
        <div
          className={`transition-transform duration-300 ease-in-out ${
            modoHorizontal
              ? "absolute left-0 top-0 flex flex-col gap-4 p-4"
              : "flex flex-col gap-4 p-8 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-3 max-md:pb-[clamp(1rem,4vw,2rem)]"
          }`}
          style={
            modoHorizontal
              ? { width: "100vh", height: "100vw", transformOrigin: "top left", transform: "rotate(90deg) translateY(-100%)" }
              : { transformOrigin: "top left", transform: "none" }
          }
        >
        {/* Rediseño 2026-08-27 (pedido explícito del cliente: "encontrar
            una forma ingeniosa de manejar el calendario para las
            opciones de semana y mes sin necesidad de moverse
            horizontalmente por la página, sino moverse dentro del
            calendario... todo tiene que ser fijo en movimiento de la
            página en sí"). Reemplaza la clase `.panel-cal-min-w`/TR-029
            (título + toolbar + calendario compartían un min-width fijo
            — hasta 64+dias×130px en Semana — para forzar el scroll
            horizontal UNIFICADO de <main>, arrastrando toda la página
            de costado). Título y toolbar ya no fuerzan ningún ancho —
            envuelven (`flex-wrap`) como cualquier fila normal. El único
            que necesita moverse de costado en Semana (7 columnas + la
            franja de horas) es el calendario en sí — ESE contenido
            lleva su propio min-width (ver `CalendarGrid`/`anchoMinDias`
            más abajo) DENTRO de esta caja, que es la que scrollea sola
            (ver el div con `overflow-x-auto` unas líneas más abajo) —
            nunca la página. Mes no necesita nada de esto (7 columnas
            fluidas, sin overflow) y Día tampoco (una sola columna). */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1
            className={`font-[family-name:var(--font-display)] font-medium text-grafito ${
              modoHorizontal ? "text-xl" : "text-3xl max-md:text-[clamp(1.375rem,6.5vw,1.875rem)]"
            }`}
          >
            Calendario
          </h1>
          {/* "+ Agregar turno" disponible en los dos modos (F2.2,
              corrección de QA: "que el usuario pueda cargar turnos en
              este modo y hacer demás opciones... dentro de calendario")
              — antes el modo horizontal tenía una versión recortada sin
              esta acción. */}
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil shadow-soft hover:brightness-95 whitespace-nowrap"
          >
            + Agregar turno
          </button>
        </div>

        {toolbar}

        {/* Altura fija (h-[600px]) en modo normal / `h-full` en modo
            horizontal (ver `cajaCalendario` más arriba) + scroll interno
            propio en las dos direcciones — vuelve a ser su propio
            contenedor de scroll en cualquier ancho: Semana scrollea
            horizontal SOLO acá adentro (ver el min-width que le da
            CalendarGrid a su propio contenido, no a esta caja), Mes/Día
            no necesitan ningún scroll horizontal y no lo generan.
            `min-h-0`: sin esto, un hijo `flex-1` dentro de un
            `flex-col` no se achica por debajo de su alto de contenido
            (la misma trampa clásica de flexbox de siempre en este
            proyecto) — en modo horizontal, esta caja necesita poder
            ocupar SOLO el espacio que sobra después del título y el
            toolbar, no más. `display: contents` en modo normal: sin
            envolver nada de más, esta caja ya tenía su propio alto fijo
            de siempre. */}
        <div className={modoHorizontal ? "min-h-0 flex-1" : "contents"}>{cajaCalendario}</div>
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
    </CalendarRotationContext.Provider>
  );
}
