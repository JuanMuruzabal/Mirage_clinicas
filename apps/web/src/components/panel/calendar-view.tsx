"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  BloqueoHorario,
  HorarioAtencion,
  TipoConsulta,
  Turno,
} from "@dental-mirage/shared-types";
import { listTurnosAction } from "@/app/actions/turnos";
import {
  listBloqueosAction,
  listHorarioAtencionAction,
} from "@/app/actions/calendario-config";
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
  minutosDesdeMedianocheCordoba,
  parseFechaISOLocal,
  type VistaCalendario,
} from "@/lib/calendar-utils";
import {
  CalendarGrid,
  columnasDeDias,
  GUTTER_PX,
  COL_PX,
  HORA_INICIO,
  PX_POR_HORA,
  idRealDeExcepcion,
  segmentosParaVisualizar,
  turnoResuelto,
} from "./calendar-grid";
import { CalendarMonthGrid } from "./calendar-month-grid";
import { AgregarTurnoModal } from "./agregar-turno-modal";
import { TurnoDetalle } from "./turno-detalle";
import { ConfiguracionCalendarioModal } from "./configuracion-calendario-modal";
import { BloqueoDetalleModal } from "./bloqueo-detalle-modal";
import { ReservarHorarioModal } from "./reservar-horario-modal";
import { IconSettings } from "@/components/icons";
import { ZonaProfesional, type OpcionProfesional } from "./zona-profesional";
import { elegirVistaAction } from "@/app/actions/topbar-panel";
import { panelNotificacionesAction } from "@/app/actions/panel";
import type { VistaActual } from "@dental-mirage/shared-types";
import { useEstadoDelServidor } from "@/lib/estado-del-servidor";

interface CalendarViewProps {
  tiposConsulta: TipoConsulta[];
  turnosIniciales: Turno[];
  // Fase 3.2.6 — la vista general de recepción: en vista DÍA, una
  // columna por profesional en vez de una sola con todo mezclado
  // (mockup `calendario-recepcion.html`).
  //
  // Viene vacío en cualquier otro caso —un profesional mirando su propia
  // agenda, o recepción parada en la vista de alguien— y entonces el
  // calendario es exactamente el de siempre.
  profesionalesDelDia?: { userId: string; nombre: string }[];
  // El selector de vista de recepción, dibujado DESDE ACÁ y no desde la
  // página (QA de la 3.2.6).
  //
  // Tiene que vivir del lado del cliente porque lo que puede ofrecer
  // depende de Día/Semana/Mes, y eso es estado de este componente: la
  // página no se entera cuando alguien toca "Semana".
  zonaProfesional?: {
    profesionales: OpcionProfesional[];
    vista: VistaActual | null;
  } | null;
  // vistaKey — QUIÉN es la vista actual: el userId del profesional en
  // foco, o "general" (Fase 3.2.6).
  //
  // No se usa para mostrar nada; está para que el fetch del cliente
  // vuelva a correr cuando recepción cambia de profesional. Ver el
  // comentario del efecto de abajo: sin esto el calendario se quedaba
  // con los turnos del profesional anterior hasta que alguien tocaba
  // "Hoy" (bug reportado en QA).
  vistaKey?: string;
  // "?vista=semana" desde la tarjeta "Turnos próximos" del dashboard
  // (pedido explícito del cliente, 2026-08-27) — sin esto, "Hoy" (día)
  // sigue siendo el default de siempre (2026-08-23).
  vistaInicial?: VistaCalendario;
  // fechaInicialStr/turnoAFocalizarId (F2.3 extra ítem 1, docs/Arquitectura y base/implementation-plan.md
  // §11.5) — deep-link desde una fila de tarjeta del dashboard "Turnero":
  // fechaInicialStr ancla la semana/día que se ve al entrar a la fecha
  // REAL del turno en vez de siempre "hoy"/la semana actual;
  // turnoAFocalizarId abre el detalle de ese turno apenas están cargados
  // los datos.
  //
  // STRING ("YYYY-MM-DD"), no un Date ya armado (bug real de QA,
  // 2026-09-06: "toco un turno de hoy... en el calendario me está
  // ubicando... del día 31 no hoy 1") — un Date es un INSTANTE (un
  // timestamp), y al cruzar de Server a Client Component, React lo
  // serializa/reconstruye por ese instante exacto, no por sus dígitos de
  // calendario locales. `calendario/page.tsx` (servidor, en el
  // contenedor, típicamente UTC) arma `new Date(2026, 8, 1)` — medianoche
  // LOCAL AL CONTENEDOR, ej. "2026-09-01T00:00:00Z" si el contenedor está
  // en UTC. Ese mismo instante, leído del lado del CLIENTE con getters
  // locales (`getDate()`, lo que hace `fecha` de acá abajo) en un
  // navegador con timezone negativo (Argentina, UTC-3) da "31 de agosto,
  // 21:00" — un día entero para atrás. Pasando el string y parseándolo
  // ACÁ, con `parseFechaISOLocal` (mismo constructor local en el mismo
  // proceso que lo lee), el resultado es siempre el mismo sea cual sea el
  // timezone del contenedor o del navegador de quien mira la pantalla.
  fechaInicialStr?: string;
  turnoAFocalizarId?: string;
  // turnoAPosicionar (corrección de QA, 2026-09-08): "el ver calendario
  // de estas tarjetas [Turnos de hoy/Turnos próximos] me llevara a la
  // primera vista del turno más próximo... no tiene que abrir la
  // tarjeta del turno, sino ubicar el calendario a la vista del usuario
  // con el turno más próximo visible" — a diferencia de
  // turnoAFocalizarId (deep-link de UNA FILA puntual, que sí abre el
  // detalle), este NUNCA abre TurnoDetalle: solo scrollea el calendario
  // (día y hora) para que ese turno quede a la vista.
  turnoAPosicionar?: string;
  // bloqueoAFocalizarId (F2.3 extra ítem 1) — deep-link desde una fila de
  // la tarjeta "Horarios reservados" del dashboard: abre el mismo "Ver
  // eventos" que tocar ese bloqueo en el grid — el cluster de
  // solapamiento entero al que pertenezca, si corresponde, no solo ese
  // bloqueo puntual aislado.
  bloqueoAFocalizarId?: string;
}

// VISTA_LABEL — ver el comentario junto al toggle Día/Semana/Mes, más
// abajo en el JSX.
const VISTA_LABEL: Record<VistaCalendario, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
};

// T2.3: toolbar prev/next/Hoy + toggle Mes/Semana/Día + contenedor de
// ALTURA FIJA con scroll interno propio (clave del pedido: "no estira la
// página"). T2.4/T2.5 viven acá adentro: el modal de agregar turno y el
// error controlado de solapamiento ya vienen resueltos por las Server
// Actions (app/actions/turnos.ts) — este componente solo muestra el error
// que le devuelvan.
export function CalendarView({
  tiposConsulta,
  turnosIniciales,
  profesionalesDelDia = [],
  zonaProfesional = null,
  vistaKey = "general",
  vistaInicial,
  fechaInicialStr,
  turnoAFocalizarId,
  turnoAPosicionar,
  bloqueoAFocalizarId,
}: CalendarViewProps) {
  // Vista inicial "Hoy" (día) por default — pedido explícito del cliente
  // (2026-08-23): lo primero que se ve al entrar al calendario es el día
  // de hoy, no la semana. `vistaInicial` (2026-08-27) permite arrancar
  // directo en Semana cuando se llega desde la tarjeta "Turnos próximos"
  // del dashboard, sin tocar ese default para quien entra por el menú.
  const [vista, setVista] = useState<VistaCalendario>(vistaInicial ?? "dia");
  const router = useRouter();
  const [cambiandoDeFoco, iniciarCambioDeFoco] = useTransition();
  // Recepción sin nadie en foco: la vista general de la clínica.
  const enVistaGeneral =
    zonaProfesional != null && zonaProfesional.vista?.profesional == null;
  // hoyEnCordoba() (encontrado investigando un error de hidratación de
  // React, 2026-08-30), no `new Date()` — este estado se calcula tanto en
  // el server (SSR) como al hidratar en el cliente, y `new Date()` leído
  // con getters locales (getFullYear/getMonth/getDate, ver
  // calendar-utils.ts) puede caer en un día de calendario DISTINTO en
  // cada uno si sus timezones ambiente no coinciden (el container corre
  // en UTC; el navegador de cada visitante, en la suya) — mismatch de
  // hidratación, "sáb 29" (server) vs "dom 30" (cliente).
  const [fecha, setFecha] = useState(() =>
    fechaInicialStr ? parseFechaISOLocal(fechaInicialStr) : hoyEnCordoba(),
  );
  // Ver pacientes-table.tsx: sin esto, un turno editado o un conflicto
  // de calendario resuelto seguían pintados hasta refrescar a mano.
  const [turnos, setTurnos] = useEstadoDelServidor<Turno[]>(turnosIniciales);
  const [cargando, setCargando] = useState(false);
  const [cargandoConfig, setCargandoConfig] = useState(false);
  // Al cambiar de profesional, la pantalla entra en "Cargando…"
  // hasta que llega la tanda nueva. Sin esto se vería, por un
  // instante, el rango por defecto que trajo el `router.refresh()`
  // mezclado con la fecha a la que el usuario había navegado — datos
  // correctos de un rango equivocado, que es peor que un spinner.
  // Mismo patrón de "ajustar estado cuando cambia una prop" que usa
  // el resto del proyecto.
  //
  // Y LA CONFIGURACIÓN TAMBIÉN CUENTA COMO "CARGANDO" (QA de la 3.2.6,
  // 2026-09-21). `cargando` seguía solo a los turnos, así que al cambiar
  // de profesional la grilla volvía a dibujarse en cuanto llegaban los
  // turnos NUEVOS, todavía con los horarios reservados VIEJOS: por unos
  // segundos aparecía la tarjeta de conflicto del profesional anterior.
  // Son dos pedidos independientes y hay que esperar a los dos.
  const [ultimaVista, setUltimaVista] = useState(vistaKey);
  if (ultimaVista !== vistaKey) {
    setUltimaVista(vistaKey);
    setCargando(true);
    setCargandoConfig(true);
  }

  const [modalAbierto, setModalAbierto] = useState(false);
  // reservarHorarioAbierto — acceso rápido "+ Reservar horario" (pedido
  // explícito del cliente, 2026-09-04): "agregar un acceso rápido a
  // reservar horario desde la pantalla principal del calendario al lado
  // de agregar turno... sin ir al panel poder agregarlos por el acceso
  // rápido". Al guardar, recarga bloqueosGenerales/bloqueosEspecificas
  // (cargarConfigCalendario, más abajo) para que se vea en el grid al
  // toque, sin esperar a abrir/cerrar Configuración de calendario.
  const [reservarHorarioAbierto, setReservarHorarioAbierto] = useState(false);
  // turnoAFocalizarId (F2.3 extra ítem 1, docs/Arquitectura y base/implementation-plan.md
  // §11.5): en vez de un useEffect que llame a setTurnoSeleccionado al
  // montar (react-hooks/set-state-in-effect: "avoid calling setState
  // directly within an effect"), se resuelve una sola vez acá mismo, en
  // el inicializador perezoso — turnosIniciales ya viene con el turno
  // adentro (calendario/page.tsx resuelve el rango a partir de la fecha
  // real del turno), no hace falta esperar ningún fetch de cliente.
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<Turno | null>(
    () =>
      turnoAFocalizarId
        ? (turnosIniciales.find((t) => t.id === turnoAFocalizarId) ?? null)
        : null,
  );
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
  const [bloqueosGenerales, setBloqueosGenerales] = useState<BloqueoHorario[]>(
    [],
  );
  const [bloqueosEspecificas, setBloqueosEspecificas] = useState<
    BloqueoHorario[]
  >([]);
  // horariosAtencion (nueva función, 2026-09-08): TODAS las filas
  // (general + excepciones), para que CalendarGrid traduzca las
  // excepciones temporales a horarios reservados sintéticos por día
  // (cierresDeExcepciones) — "básicamente es lo mismo que horarios
  // reservados, pero ahora puede abarcar días completos" (textual del
  // cliente). Se recarga junto con bloqueosGenerales/bloqueosEspecificas.
  const [horariosAtencion, setHorariosAtencion] = useState<HorarioAtencion[]>(
    [],
  );
  // reglasSeleccionadas (corrección de QA, 2026-08-30, rediseñada
  // 2026-08-31 a una LISTA en vez de un bloqueo + "otra regla de abajo"):
  // un solo elemento para un tramo sin solapamiento, dos o más para un
  // tramo "combinado" — ver el comentario grande en calendar-grid.tsx
  // (bloqueosParaVisualizar) para la regla completa de solapamiento.
  const [reglasSeleccionadas, setReglasSeleccionadas] = useState<
    BloqueoHorario[] | null
  >(null);
  const [reglaAFocalizar, setReglaAFocalizar] = useState<string | null>(null);
  // horarioAtencionAFocalizar (nueva función, 2026-09-08): "agregar botón
  // de ver excepción de horario al tocar la tarjeta de horario de
  // excepción en el calendario" — mismo mecanismo que reglaAFocalizar,
  // pero para la tabla de excepciones de horario de atención en
  // Configuración de calendario en vez de horarios reservados.
  const [horarioAtencionAFocalizar, setHorarioAtencionAFocalizar] = useState<
    string | null
  >(null);
  // turnosEnConflictoSeleccionados / reglasEnConflictoDelTurno — paso 2
  // (manejo de conflictos con turnos, 2026-09-04). El primero acompaña a
  // `reglasSeleccionadas`: los turnos del mismo cluster "conflicto" (ver
  // calendar-grid.tsx), vacío en cualquier tramo sin turnos involucrados.
  // El segundo solo se completa al pasar de ese modal combinado a
  // TurnoDetalle ("Ver turno" de una tarjeta en conflicto) — es lo que le
  // dice a TurnoDetalle que muestre el aviso de conflicto; un turno
  // abierto desde el grid normal (sin conflicto) lo deja vacío.
  const [turnosEnConflictoSeleccionados, setTurnosEnConflictoSeleccionados] =
    useState<Turno[]>([]);
  const [reglasEnConflictoDelTurno, setReglasEnConflictoDelTurno] = useState<
    BloqueoHorario[]
  >([]);
  // focoBloqueoInicialHecho — guarda de una sola vez para resolver
  // bloqueoAFocalizarId (F2.3 extra ítem 1) apenas cargan los bloqueos por
  // primera vez; evita reabrir el modal cada vez que cargarConfigCalendario
  // se vuelve a llamar (ej. al cerrar Configuración de calendario).
  const focoBloqueoInicialHecho = useRef(false);

  // LA RESPUESTA VIEJA NO PISA A LA NUEVA (QA de la 3.2.6, 2026-09-21).
  //
  // Reportado así: *"veo la tarjeta de conflicto, cambio a otro
  // profesional y me muestra por unos segundos la del profesional
  // anterior; al volver, la tarjeta desaparece y tengo que ir a otra
  // vista para arreglarlo"*.
  //
  // Esta función se dispara al montar, al cambiar de profesional y al
  // cerrar la configuración, y no tenía forma de cancelarse: dos pedidos
  // en vuelo terminaban en el orden en que contestara el servidor, no en
  // el que se pidieron. El que llegaba último ganaba, aunque fuera el
  // viejo — de ahí el parpadeo, y de ahí que al volver quedara pegada la
  // respuesta equivocada hasta que otra navegación la refrescara.
  //
  // Un contador y no un booleano: hay que poder descartar CUALQUIER
  // respuesta anterior, no solo la inmediatamente previa.
  const cargaConfigRef = useRef(0);
  // Pendiente de abrir apenas lleguen los datos del día al que estamos
  // viajando (ver `abrirConflictoMasProximo`). Un ref y no estado: no se
  // dibuja, solo se consulta.
  const conflictoPendienteRef = useRef(false);

  function cargarConfigCalendario() {
    const miCarga = ++cargaConfigRef.current;
    Promise.all([
      listBloqueosAction(false),
      listBloqueosAction(true),
      listHorarioAtencionAction(),
    ]).then(([generales, especificas, horarios]) => {
      if (miCarga !== cargaConfigRef.current) return;
      setBloqueosGenerales(generales);
      setBloqueosEspecificas(especificas);
      setHorariosAtencion(horarios);
      setCargandoConfig(false);
      // Agregar o borrar un horario reservado puede crear o resolver un
      // conflicto, y el número de arriba sale del servidor.
      releerConflictos();
      // bloqueoAFocalizarId (F2.3 extra ítem 1, docs/Arquitectura y base/implementation-plan.md
      // §11.5): "cuando dé click a un elemento del cuerpo [de la tarjeta
      // Horarios reservados], también llevarme a la tarjeta de ese
      // elemento... si forma parte de un solapamiento, también abrirme
      // esa tarjeta" — mismo cálculo de clusters que usa el click real
      // sobre el grid (segmentosParaVisualizar), no una versión aparte;
      // dentro del .then() (no synchronous en el cuerpo del efecto que lo
      // dispara) porque depende de que generales/especificas/horarios ya
      // hayan llegado del servidor.
      if (bloqueoAFocalizarId && !focoBloqueoInicialHecho.current) {
        focoBloqueoInicialHecho.current = true;
        const turnosDelDia = turnos.filter(
          (t) => t.horaInicio && isSameDay(new Date(t.horaInicio), fecha),
        );
        const segmento = segmentosParaVisualizar(
          fecha,
          generales,
          especificas,
          turnosDelDia,
          horarios,
        ).find((s) => s.reglas.some((r) => r.id === bloqueoAFocalizarId));
        if (segmento) {
          setReglasSeleccionadas(segmento.reglas);
          setTurnosEnConflictoSeleccionados(segmento.turnos);
          // Corrección de QA, 2026-09-08: "al tocar algún elemento del
          // cuerpo de la tarjeta... de horarios reservados, también que
          // te ubique visualmente... como hace con turnos de hoy y
          // turnos próximos" — mismo scroll horizontal (día, en Semana)
          // + vertical (hora) que ya tienen los turnos, acá con
          // `segmento.desde` (ya en minutos-desde-medianoche-Córdoba,
          // no hace falta convertir un Date).
          if (vista === "semana") scrollAlDia(dias, fecha);
          scrollAHora(segmento.desde);
        }
      }
    });
  }

  // Al montar Y AL CAMBIAR DE PROFESIONAL (`vistaKey`).
  //
  // Sin `vistaKey` acá quedaba el bug que reportó la QA: *"el horario
  // reservado de un profesional se sigue filtrando a otros en su
  // calendario, y a veces aparece y otras no"*. Los horarios reservados y
  // el horario de atención son estado del CLIENTE, cargado una sola vez;
  // cambiar de profesional dispara un `router.refresh()` que renueva las
  // props del servidor, pero no vuelve a correr esto — así que el
  // calendario seguía dibujando los bloqueos del profesional anterior.
  //
  // Y de ahí la intermitencia, que fue la mejor pista: abrir y cerrar
  // "Configuración de calendario" llama a `cargarConfigCalendario` por su
  // cuenta (`cerrarConfig`), así que recién ahí se corregía — el bloqueo
  // aparecía o desaparecía según desde qué profesional se hubiera abierto
  // la configuración la última vez.
  //
  // Las demás variables que la función lee (`bloqueoAFocalizarId`,
  // `turnos`, `fecha`) siguen fuera a propósito: son para resolver el
  // deep-link UNA sola vez, con los valores iniciales, y `focoBloqueoInicialHecho`
  // ya impide que se repita.
  useEffect(() => {
    cargarConfigCalendario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaKey]);

  function cerrarConfig() {
    setConfigAbierta(false);
    setReglaAFocalizar(null);
    setHorarioAtencionAFocalizar(null);
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
    listTurnosAction({
      estado: "agendado",
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    }).then((data) => {
      if (activo) {
        setTurnos(data);
        setCargando(false);
      }
    });
    return () => {
      activo = false;
    };
    // `vistaKey` en las dependencias, y es el arreglo de un bug real
    // (QA de la 3.2.6: "para ver bien los turnos correspondientes a cada
    // uno tengo que presionar Hoy porque no se actualizan apenas cambio
    // de vista").
    //
    // Cambiar de profesional dispara un `router.refresh()`, que sí trae
    // turnos nuevos del servidor — pero para el rango POR DEFECTO, no
    // para la semana o el mes al que el cliente ya navegó. Y este
    // efecto, mirando solo `[fecha, vista]`, no se enteraba de que había
    // que volver a pedir. Tocar "Hoy" cambiaba `fecha` y lo despertaba
    // de rebote; de ahí el síntoma.
    //
    // Con la vista en las dependencias, el calendario del profesional en
    // foco vale para CUALQUIER fecha a la que se haya navegado, que es
    // lo que se pidió.
    //
    // `setTurnos` está en la lista por el lint: sale de
    // `useEstadoDelServidor`, que devuelve el setter de un `useState` y
    // por lo tanto es estable — sumarlo no cambia cuándo corre esto.
  }, [fecha, vista, vistaKey, setTurnos]);

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
    box.scrollTo({
      left: Math.max(GUTTER_PX + idx * COL_PX - COL_PX / 2, 0),
      behavior: "smooth",
    });
  }

  // scrollAHora — corrección de QA, 2026-09-08: "Ver calendario ->" de
  // las tarjetas del dashboard tiene que UBICAR el calendario con el
  // turno/horario reservado más próximo A LA VISTA (vertical, no solo
  // horizontal como scrollAlDia arriba) — sin esto, algo de la tarde
  // quedaba fuera de lo visible en día/semana hasta que el profesional
  // scrolleaba a mano. Recibe minutos-desde-medianoche-Córdoba
  // directamente (no un Date) — la tarjeta "Horarios reservados"
  // resuelve un CLUSTER (segmento.desde, ya en esa unidad, ver
  // calendar-grid.tsx) que no siempre tiene un único horaInicio real
  // como un turno. Mismo cálculo de posición que usa CalendarGrid para
  // dibujar el bloque (HORA_INICIO/PX_POR_HORA, exportadas de ahí para
  // no duplicar la geometría), con un poco de aire arriba (una hora) en
  // vez de dejarlo pegado al borde de arriba.
  function scrollAHora(minutos: number) {
    const box = scrollBoxRef.current;
    if (!box) return;
    const top = (minutos / 60 - HORA_INICIO) * PX_POR_HORA;
    box.scrollTo({ top: Math.max(top - PX_POR_HORA, 0), behavior: "smooth" });
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

    // LA VISTA GENERAL ES EXCLUSIVA DE "DÍA" (QA de la 3.2.6, pedido
    // textual: *"la vista general es exclusiva de la opción 'día' del
    // calendario, ya al pasar semana o mes siempre seleccionar el
    // profesional más próximo en la vista"*).
    //
    // No es una restricción arbitraria: en Día la vista general dibuja
    // una columna por profesional, que es lo que la hace legible. En
    // Semana las siete columnas ya son los días — meter ahí también a
    // cada profesional daría 7 × N columnas. Sin columnas propias, "la
    // agenda de todos" sería un amontonamiento de bloques sin dueño.
    //
    // Así que al salir de Día se elige a alguien. Quién: el profesional
    // MÁS PRÓXIMO en lo que se está mirando — el dueño del primer turno
    // del día, que es el que la persona tiene delante de los ojos. Si no
    // hay ninguno, el primero de la lista, que es la primera columna.
    if (enVistaGeneral && v !== "dia") {
      const elegido = profesionalMasProximo();
      if (elegido) {
        setCargando(true);
        setVista(v);
        if (v === "semana") scrollPendienteRef.current = hoyEnCordoba();
        cambiarDeFoco(elegido);
        return;
      }
    }

    setCargando(true);
    setVista(v);
    // No se scrollea acá mismo — ver el efecto de abajo, guardado en
    // `scrollPendienteRef` hasta que `cargando` vuelva a `false`.
    if (v === "semana") scrollPendienteRef.current = hoyEnCordoba();
  }

  // profesionalMasProximo — de quién es el turno que viene primero en lo
  // que se está mirando. Los turnos del día ya están en memoria (son los
  // que la grilla dibuja), así que esto no pide nada al servidor.
  function profesionalMasProximo(): string | null {
    const delDia = turnos
      .filter((t) => t.horaInicio && isSameDay(new Date(t.horaInicio), fecha))
      .filter((t) => t.atendidoPorUserId)
      .sort((a, b) => (a.horaInicio ?? "").localeCompare(b.horaInicio ?? ""));
    // Contra la lista del SELECTOR y no contra `profesionalesDelDia`:
    // las dos traen lo mismo en la vista general, pero la del selector es
    // la que define a quién se puede saltar. Atarlo a la otra dejaba esto
    // dependiendo de que dos props viajaran siempre juntas.
    const candidatos = zonaProfesional?.profesionales ?? [];
    const conColumna = delDia.find((t) =>
      candidatos.some((p) => p.userId === t.atendidoPorUserId),
    );
    return conColumna?.atendidoPorUserId ?? candidatos[0]?.userId ?? null;
  }

  function cambiarDeFoco(userId: string) {
    iniciarCambioDeFoco(async () => {
      await elegirVistaAction(userId);
      // Cambiar de foco cambia lo que el servidor devuelve para esta
      // pantalla, así que hay que volver a pedirla — el efecto de los
      // turnos se despierta solo cuando llega el `vistaKey` nuevo.
      router.refresh();
    });
  }

  function irAHoy() {
    const hoy = hoyEnCordoba();
    setCargando(true);
    setFecha(hoy);
    if (vista === "semana") scrollPendienteRef.current = hoy;
  }

  function recargar() {
    const { desde, hasta } = rangoVisible(fecha, vista);
    listTurnosAction({
      estado: "agendado",
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    }).then(setTurnos);
  }

  const dias = diasDeVista(fecha, vista);
  const esperando = cargando || cargandoConfig;

  // UNA COLUMNA POR PROFESIONAL, y solo en vista Día (Fase 3.2.6).
  //
  // En Semana la grilla ya usa las siete columnas para los días: meter
  // ahí también a cada profesional daría 7 × N columnas, ilegible en
  // cualquier pantalla. El mockup toma la misma decisión — Semana y Mes
  // muestran el alcance elegido mezclado, y es en el Día donde se
  // comparan las agendas.
  //
  // El conteo del encabezado sale de los mismos turnos que la columna va
  // a dibujar, no de una consulta aparte: si dicen distinto, el que está
  // mal es el número.
  const porProfesional = vista === "dia" && profesionalesDelDia.length > 0;
  const columnas = porProfesional
    ? profesionalesDelDia.map((p) => {
        const suyos = turnos.filter(
          (t) =>
            t.atendidoPorUserId === p.userId &&
            t.horaInicio &&
            isSameDay(new Date(t.horaInicio), fecha),
        );
        return {
          clave: p.userId,
          dia: fecha,
          titulo: p.nombre,
          subtitulo: `${suyos.length} ${suyos.length === 1 ? "turno" : "turnos"}`,
          userId: p.userId,
        };
      })
    : columnasDeDias(dias);
  const titulo =
    vista === "mes"
      ? formatMesAnio(fecha)
      : vista === "semana"
        ? formatRangoSemana(fecha)
        : formatDiaLargo(fecha);
  // turnosEnRangoVisible — corrección de estética (2026-09-06, foto de
  // referencia "nueva estetica calendario.png"): pastilla "2 turnos" al
  // lado de la fecha. En Día, cuenta solo ESE día (coincide con lo que
  // el usuario ve en el grid); en Semana/Mes, `turnos` ya es exactamente
  // el rango cargado (ver `recargar`/el efecto de carga más abajo), sin
  // filtrar de nuevo.
  //
  // TR-115 había sumado acá un filtro para descartar turnos resueltos
  // ("los 'x turnos'... solo deben ser turnos activos, no resueltos").
  // En la ronda de correcciones de Fase 2.4.2 (TR-116, cuarta ronda) el
  // cliente aclaró explícitamente lo contrario para esta rama: "esto no
  // lo toqué, está bien como está ahora" — pedido textual que prevalece.
  // Al mergear TR-115 (`dev`) acá, ese filtro volvió a colarse en un
  // auto-merge silencioso (ninguna de las dos ramas tocaba la MISMA
  // línea, así que Git no marcó conflicto) — se saca de nuevo a mano.
  const turnosEnRangoVisible =
    vista === "dia"
      ? turnos.filter(
          (t) => t.horaInicio && isSameDay(new Date(t.horaInicio), fecha),
        ).length
      : turnos.length;

  // Banner de conflicto (F2.3 extra ítem 2, docs/Arquitectura y base/implementation-plan.md
  // §11.5) — mismo cálculo de clusters que usa el click real sobre el
  // grid (segmentosParaVisualizar), agregado sobre TODOS los días
  // visibles en la vista actual (día/semana/mes), no uno nuevo aparte.
  // `turnoResuelto`: un conflicto cuyo turno ya pasó deja de contar como
  // activo (TR-090) — "dado el caso de agendar algo con reserva y al
  // final no hacer nada con eso" no debería seguir sumando al contador.
  //
  // UN CÁLCULO POR AGENDA, NO UNO SOLO MEZCLADO (QA de la 3.2.6,
  // 2026-09-20). Este banner recalcula los clusters por su cuenta, y lo
  // hacía sobre TODOS los turnos contra TODOS los horarios reservados y
  // excepciones. En la vista general de la clínica eso cruza gente: el
  // turno de uno contra la excepción de horario de otro, marcado como
  // conflicto — *"cosa que no existe"*, y que además no se podría
  // resolver desde ninguna pantalla.
  //
  // La grilla ya separaba por columna; esto no, y por eso el bloque de la
  // excepción desaparecía del día pero el turno seguía contando como en
  // conflicto. Mismo criterio que allá: cada agenda se compara solo
  // consigo misma.
  const agendasAComparar: (string | undefined)[] = porProfesional
    ? profesionalesDelDia.map((p) => p.userId)
    : [undefined];

  const segmentosConConflicto = dias
    .flatMap((dia) =>
      agendasAComparar.flatMap((userId) => {
        const deLaAgenda = <T extends { userId?: string | null }>(items: T[]) =>
          userId === undefined ? items : items.filter((i) => i.userId === userId);
        const turnosDelDia = turnos.filter(
          (t) =>
            t.horaInicio &&
            isSameDay(new Date(t.horaInicio), dia) &&
            (userId === undefined || t.atendidoPorUserId === userId),
        );
        return segmentosParaVisualizar(
          dia,
          deLaAgenda(bloqueosGenerales),
          deLaAgenda(bloqueosEspecificas),
          turnosDelDia,
          deLaAgenda(horariosAtencion),
        );
      }),
    )
    .filter((seg) => seg.variante === "conflicto")
    .map((seg) => ({
      ...seg,
      turnosActivos: seg.turnos.filter((t) => !turnoResuelto(t)),
    }))
    .filter((seg) => seg.turnosActivos.length > 0);
  const turnosEnConflictoALaVista = segmentosConConflicto.reduce(
    (acc, seg) => acc + seg.turnosActivos.length,
    0,
  );

  // EL AVISO NO DESAPARECE AL CAMBIAR DE DÍA (QA de la 3.2.6,
  // 2026-09-21).
  //
  // Reportado así: *"si yo me voy a otro día, o semana que no muestre ese
  // día, la notificación de abajo del selector del calendario desaparece;
  // es ese el que no debe desaparecer"*.
  //
  // El número salía de `segmentosConConflicto`, que se calcula sobre lo
  // que la vista tiene CARGADO — un día en Día, una semana en Semana. Un
  // conflicto del martes dejaba de existir apenas mirabas el miércoles,
  // que es justo cuando hace falta que avise.
  //
  // Ahora el conteo viene del backend, que mira la clínica entera sin
  // tope de fechas (`contarTurnosEnConflictoConBloqueos`), y trae además
  // el día y el dueño del más próximo para poder llevar hasta él.
  const [conflictosGlobales, setConflictosGlobales] = useState<{
    total: number;
    fecha?: string;
    profesionalUserId?: string;
  }>({ total: 0 });

  function releerConflictos() {
    panelNotificacionesAction().then((n) => {
      if (!n) return;
      setConflictosGlobales({
        total: n.conflictosCalendario,
        fecha: n.conflictoCalendarioFecha,
        profesionalUserId: n.conflictoCalendarioProfesionalId,
      });
    });
  }

  // Al montar, al cambiar de profesional, y cada vez que se toca algo que
  // puede crear o resolver un conflicto (ver `cargarConfigCalendario`).
  useEffect(() => {
    releerConflictos();
  }, [vistaKey]);

  const totalTurnosEnConflicto = Math.max(
    conflictosGlobales.total,
    turnosEnConflictoALaVista,
  );

  // Llegamos al día del conflicto: se abre la pantalla de resolución.
  //
  // DURANTE EL RENDER y no en un `useEffect`: es el mismo patrón de
  // "ajustar estado cuando cambia lo que se está mirando" que usa
  // `ultimaVista` más arriba y `useEstadoDelServidor` en el resto del
  // panel. Con un efecto, el lint del proyecto lo rechaza
  // (`react-hooks/set-state-in-effect`) y además quedaría un frame con el
  // calendario ya en el día correcto y el modal todavía sin abrir.
  //
  // El ref es la guarda: sin él, cada render volvería a abrirlo.
  if (
    conflictoPendienteRef.current &&
    !esperando &&
    segmentosConConflicto.length > 0
  ) {
    conflictoPendienteRef.current = false;
    const seg = segmentosConConflicto[0];
    setReglasSeleccionadas(seg.reglas);
    setTurnosEnConflictoSeleccionados(seg.turnos);
  }

  // Al tocar el banner, abre el "Ver eventos" del conflicto MÁS PRÓXIMO en
  // el tiempo — pedido textual: "al tocar toca para ver abrirá el ver
  // eventos... del turno en conflicto más próximo" — nunca el primero de
  // la lista sin ordenar.
  function abrirConflictoMasProximo() {
    const candidatos = segmentosConConflicto
      .flatMap((seg) =>
        seg.turnosActivos.map((t) => ({
          seg,
          horaInicio: new Date(t.horaInicio!).getTime(),
        })),
      )
      .sort((a, b) => a.horaInicio - b.horaInicio);

    if (candidatos.length > 0) {
      const { seg } = candidatos[0];
      setReglasSeleccionadas(seg.reglas);
      setTurnosEnConflictoSeleccionados(seg.turnos);
      return;
    }

    // NO ESTÁ A LA VISTA: hay que ir hasta él. *"Si estoy por fuera de la
    // vista de conflicto de ese día, me tendría que llevar a ese día y
    // abrir la pantalla de resolución de conflicto"*.
    const { fecha: fechaConflicto, profesionalUserId } = conflictosGlobales;
    if (!fechaConflicto) return;

    conflictoPendienteRef.current = true;
    setCargando(true);
    setCargandoConfig(true);
    setFecha(parseFechaISOLocal(fechaConflicto));
    setVista("dia");

    // Si es de otra agenda, primero hay que pararse ahí: el calendario de
    // este profesional no tiene ese conflicto ni puede resolverlo.
    if (profesionalUserId && profesionalUserId !== vistaKey) {
      cambiarDeFoco(profesionalUserId);
    }
  }



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
    if (scrollInicialHecho.current) return;
    scrollInicialHecho.current = true;

    // turnoAPosicionar (corrección de QA, 2026-09-08): "Ver calendario
    // ->" de las tarjetas del dashboard — ubica el turno más próximo A
    // LA VISTA sin abrir su detalle (turnoAFocalizarId sí lo abre, ver
    // el inicializador de turnoSeleccionado más arriba, pero ambos
    // apuntan al MISMO cálculo de posición: cuál de los dos vino no
    // cambia adónde hay que scrollear).
    const idObjetivo = turnoAFocalizarId ?? turnoAPosicionar;
    const turnoObjetivo = idObjetivo
      ? turnos.find((t) => t.id === idObjetivo)
      : undefined;

    // Horizontal (qué día queda a la vista) — exclusivo de Semana, la
    // única vista que scrollea en ese eje (Día es una sola columna).
    // Busca el primer día desde hoy en adelante (dentro de la semana ya
    // cargada) que tenga al menos un turno agendado — pedido explícito
    // del cliente, 2026-08-27: "turnos próximos [en General] al
    // calendario de semana donde sea visible el primer turno más
    // próximo" — si hoy mismo tiene uno, se queda ahí igual; sin ningún
    // turno futuro en la semana, cae en hoy.
    if (vistaInicial === "semana") {
      if (turnoObjetivo?.horaInicio) {
        scrollAlDia(dias, new Date(turnoObjetivo.horaInicio));
      } else {
        const hoy = startOfDay(hoyEnCordoba());
        const diaConTurno = dias
          .filter((d) => d.getTime() >= hoy.getTime())
          .find((d) =>
            turnos.some(
              (t) => t.horaInicio && isSameDay(new Date(t.horaInicio), d),
            ),
          );
        scrollAlDia(dias, diaConTurno ?? hoyEnCordoba());
      }
    }

    // Vertical (qué hora queda a la vista) — para CUALQUIER vista (a
    // diferencia de arriba): un turno de la tarde igual queda fuera de
    // lo visible en Día si no se scrollea también en este eje.
    if (turnoObjetivo?.horaInicio) {
      scrollAHora(
        minutosDesdeMedianocheCordoba(new Date(turnoObjetivo.horaInicio)),
      );
    }
  }, [vistaInicial, dias, turnos, turnoAFocalizarId, turnoAPosicionar]);

  useEffect(() => {
    if (!menuAjustesAbierto) return;
    function onClickOutside(event: MouseEvent) {
      if (
        menuAjustesRef.current &&
        !menuAjustesRef.current.contains(event.target as Node)
      ) {
        setMenuAjustesAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuAjustesAbierto]);

  return (
    // px/pb con clamp() + pt fijo y chico (rama fix/mobile, sexta
    // corrección 2026-08-24 — ver TR-029 en docs/Arquitectura y base/tradeoffs.md: "hay un
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
      {/* El selector de vista de recepción, arriba de todo. Ofrece la
          vista general SOLO en Día: en Semana/Mes no hay columnas por
          profesional donde dibujarla, y por eso desde ahí tampoco se
          puede volver a ella (QA de la 3.2.6: *"una vez dentro de semana
          o mes no poder volver a poner vista general"*). */}
      {zonaProfesional && (
        <ZonaProfesional
          profesionales={zonaProfesional.profesionales}
          vista={zonaProfesional.vista}
          etiqueta="Viendo"
          etiquetaConFoco="Viendo la agenda de"
          conVistaGeneral={vista === "dia"}
          etiquetaGeneral="Vista general"
          detalleGeneral="Todos los profesionales del día"
        />
      )}

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
              {/* Corrección de estética (2026-09-06, foto de referencia
                  "nueva estetica calendario.png"): en reposo, la tuerca es
                  un ícono suelto sobre el fondo de la página, sin pastilla
                  verde detrás — el fondo sólido aparece recién al
                  desplegarse (necesario ahí para que el texto blanco se
                  lea). Mismo mecanismo de dos toques de siempre, sin
                  cambios. */}
              <button
                type="button"
                aria-expanded={menuAjustesAbierto}
                aria-label={
                  menuAjustesAbierto
                    ? "Abrir configuración de calendario"
                    : "Ajustes del calendario"
                }
                onClick={() => {
                  if (menuAjustesAbierto) {
                    setMenuAjustesAbierto(false);
                    setConfigAbierta(true);
                  } else {
                    setMenuAjustesAbierto(true);
                  }
                }}
                className={`flex h-9 items-center overflow-hidden rounded-full transition-colors ${
                  menuAjustesAbierto
                    ? "bg-salvia-oscuro text-marfil shadow-soft hover:brightness-95"
                    : "text-salvia-oscuro hover:bg-arena"
                }`}
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
                  <IconSettings className="h-5 w-5" />
                </span>
                <span
                  className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-300 ease-in-out ${
                    menuAjustesAbierto
                      ? "max-w-[16rem] pr-4 opacity-100"
                      : "max-w-0 opacity-0"
                  }`}
                >
                  Configuración de calendario
                </span>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {/* Corrección de estética (2026-09-06, foto de referencia):
                "Reservar horario" vuelve a un estilo claro (fondo marfil,
                borde arena) — la foto lo muestra así, distinto de "+
                Agregar turno" (verde sólido, la acción principal).
                Reemplaza la corrección de QA anterior (2026-09-04) que
                lo había igualado en verde — pedido explícito del cliente
                esta vez: "ese diseño quiero aplicar, tal cual está en la
                foto". */}
            <button
              type="button"
              onClick={() => setReservarHorarioAbierto(true)}
              className="rounded-full border-[0.5px] border-arena bg-marfil px-5 py-2.5 text-sm font-semibold text-grafito hover:border-salvia hover:text-salvia-oscuro whitespace-nowrap"
            >
              Reservar horario
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
          {/* En mobile, en COLUMNA (2026-09-19): con `flex-wrap`, la
              fecha entraba en la misma fila que "< Hoy >" o saltaba a la
              siguiente según su largo —"Hoy" contra "Sábado, 19 de
              septiembre de 2026"— y la caja cambiaba de alto al navegar
              entre días. Abajo siempre, el alto no se mueve. En
              escritorio entran las dos cosas en una fila y queda igual
              que antes. */}
          <div className="flex flex-wrap items-center gap-3 max-md:w-full max-md:flex-col max-md:items-start max-md:gap-2">
            {/* Grupo "< | Hoy | >" — corrección de estética (2026-09-06,
                foto de referencia): pasa de 3 botones con borde propio
                (separados por `gap`) a UN solo grupo con borde, separado
                por líneas finas internas (`divide-x`) — así se ve en la
                foto, sin fondo propio por botón, solo texto/ícono. */}
            <div className="flex items-center divide-x divide-arena rounded-full border-[0.5px] border-arena text-sm text-grafito">
              <button
                type="button"
                aria-label="Anterior"
                onClick={() => irA(navegar(fecha, vista, -1))}
                className="rounded-l-full px-3 py-1.5 hover:bg-arena"
              >
                ←
              </button>
              <button
                type="button"
                onClick={irAHoy}
                className="px-3 py-1.5 font-medium hover:bg-arena"
              >
                Hoy
              </button>
              <button
                type="button"
                aria-label="Siguiente"
                onClick={() => irA(navegar(fecha, vista, 1))}
                className="rounded-r-full px-3 py-1.5 hover:bg-arena"
              >
                →
              </button>
            </div>
            {/* Corrección de estética (2026-09-06): se saca la fuente
                monoespaciada — la foto de referencia muestra la fecha en
                la misma tipografía que el resto de la interfaz, no una
                fuente de "reloj". */}
            {/* La fecha y la pastilla viajan juntas: son una sola cosa
                ("qué día estoy mirando, y cuántos turnos tiene"), así que
                al pasar a columna no se separan en dos renglones. */}
            <div className="flex items-center gap-2 md:ml-2">
              <span className="text-sm font-medium text-grafito">{titulo}</span>
              {/* Pastilla de cantidad (corrección de estética, 2026-09-06,
                  foto de referencia "nueva estetica calendario.png": "2
                  turnos" al lado de la fecha) — mismo tono que los chips
                  de filtro de Turnos (`bg-salvia-claro`/`text-salvia-oscuro`). */}
              <span className="rounded-full bg-salvia-claro px-2.5 py-1 text-xs font-medium text-salvia-oscuro whitespace-nowrap">
                {turnosEnRangoVisible}{" "}
                {turnosEnRangoVisible === 1 ? "turno" : "turnos"}
              </span>
            </div>
          </div>

          {/* Selector Día/Semana/Mes — corrección de estética (2026-09-06):
              mismo criterio que las pestañas de Turnos/Pacientes (barra
              con `p-1` + pastilla activa flotando adentro, redondeada de
              punta a punta) en vez del segmentado de bordes duros de
              antes (cada opción solo redondeaba la punta exterior del
              grupo). */}
          <div className="flex rounded-full border-[0.5px] border-arena bg-marfil p-1 text-sm">
            {/* VISTA_LABEL — corrección de estética (2026-09-06): antes el
                texto salía de `capitalize` sobre el valor crudo de
                `vista` ("dia" → "Dia", sin tilde) — la foto de referencia
                muestra "Día" bien escrito. */}
            {(["dia", "semana", "mes"] as const).map((v) => (
              <button
                key={v}
                type="button"
                // Mientras el cambio de foco está en vuelo, el toggle
                // no acepta otro: salir de la vista general dispara una
                // escritura en el servidor, y encadenar dos dejaría el
                // calendario mostrando una agenda y el selector diciendo
                // otra.
                disabled={cambiandoDeFoco}
                onClick={() => cambiarVista(v)}
                className={`rounded-full px-4 py-1.5 disabled:opacity-60 ${vista === v ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
              >
                {VISTA_LABEL[v]}
              </button>
            ))}
          </div>
        </div>

        {/* Banner de conflicto (F2.3 extra ítem 2) — pedido textual: "este
            mensaje se ubicará en el espacio entre el componente donde se
            elige día, semana, mes y el calendario... aparecerá lentamente
            desde el componente de arriba, desplazando el calendario un
            poco para abajo... desaparecerá cuando ya no haya conflictos".
            `grid-rows-[0fr]`→`[1fr]` (en vez de montar/desmontar el nodo)
            es la técnica CSS estándar para animar hacia/desde una altura
            "auto" sin JS ni medir nada a mano — el `overflow-hidden`
            interno recorta el contenido mientras la fila mide 0. */}
        <div
          className={`grid transition-[grid-template-rows] duration-500 ease-out ${
            totalTurnosEnConflicto > 0
              ? "grid-rows-[1fr] mb-4"
              : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            {/* Renderizado condicional (no solo escondido por CSS): a 0
                conflictos, el botón no debe quedar en el árbol de
                accesibilidad ni ser tabulable — la altura en 0 vía
                grid-rows ya alcanza para el colapso animado. */}
            {totalTurnosEnConflicto > 0 && (
              <button
                type="button"
                onClick={abrirConflictoMasProximo}
                className="flex w-full items-center justify-between gap-3 rounded-card border-[0.5px] border-terracota bg-terracota/10 px-4 py-3 text-left text-sm font-medium text-terracota-oscuro hover:bg-terracota/15"
              >
                <span>
                  Tienes {totalTurnosEnConflicto}{" "}
                  {totalTurnosEnConflicto === 1 ? "turno" : "turnos"} en
                  conflictos, toca para ver
                </span>
              </button>
            )}
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
          {/* `esperando`: los turnos Y la configuración. Con solo los
              turnos, la grilla se redibujaba con los horarios reservados
              del profesional anterior todavía en memoria. */}
          {esperando && <p className="p-4 text-sm text-grafito/60">Cargando…</p>}
          {!esperando && vista === "mes" && (
            <CalendarMonthGrid
              dias={dias}
              mesReferencia={fecha}
              turnos={turnos}
              tiposConsulta={tiposConsulta}
              onDiaClick={(dia) => irA(dia, "dia")}
            />
          )}
          {!esperando && vista !== "mes" && (
            <CalendarGrid
              columnas={columnas}
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
              horariosAtencion={horariosAtencion}
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
            // idRealDeExcepcion — no nulo si `reglaId` es un horario
            // reservado SINTÉTICO (derivado de una excepción de horario
            // de atención, ver calendar-grid.tsx) en vez de un horario
            // reservado real: lleva la vista a la tabla de excepciones de
            // Configuración de calendario, no a la de horarios reservados.
            const idExcepcion = idRealDeExcepcion(reglaId);
            if (idExcepcion) {
              setHorarioAtencionAFocalizar(idExcepcion);
            } else {
              setReglaAFocalizar(reglaId);
            }
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
            const yaResuelto =
              Boolean(turno.horaFin) &&
              new Date(turno.horaFin!).getTime() < Date.now();
            setReglasEnConflictoDelTurno(
              yaResuelto ? [] : (reglasSeleccionadas ?? []),
            );
            setReglasSeleccionadas(null);
            setTurnosEnConflictoSeleccionados([]);
            setTurnoSeleccionado(turno);
          }}
          onEliminada={() => cargarConfigCalendario()}
          // onReprogramados (nueva función, 2026-09-08): "Autoreservar
          // turnos" movió uno o más turnos de este cluster a otro
          // horario (no necesariamente el mismo día) — recargar() vuelve
          // a pedir los turnos del rango visible para que el calendario
          // los pinte en su lugar nuevo.
          onReprogramados={recargar}
        />
      )}

      {configAbierta && (
        <ConfiguracionCalendarioModal
          onClose={cerrarConfig}
          // Elegir otro profesional DENTRO de la configuración mueve el
          // foco de la sesión, así que la pantalla de atrás tiene que
          // seguirlo: si no, el encabezado dice un nombre y el calendario
          // dibuja la agenda de otro. Con el refresh cambia `vistaKey` y
          // se recarga todo junto.
          onAgendaCambiada={() => router.refresh()}
          reglaAFocalizarId={reglaAFocalizar ?? undefined}
          horarioAtencionAFocalizarId={horarioAtencionAFocalizar ?? undefined}
        />
      )}
    </div>
  );
}
