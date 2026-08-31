import { Fragment } from "react";
import type { BloqueoHorario, TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { fechaISOLocal, formatDiaCorto, formatHora, isSameDay, minutosDesdeMedianocheCordoba } from "@/lib/calendar-utils";
import { temaTipoConsulta } from "@/lib/turno-format";

// HORA_INICIO/HORA_FIN: rango fijo, NO sale del horario de atención
// configurado (corrección de QA, F2.3: "el horario de atención que no
// modifique cómo se ve el calendario" — el horario de atención solo
// acota los selectores de hora al agendar un turno con paciente
// asociado, ver AgregarTurnoModal/EditarTurnoModal). El grid en sí
// siempre muestra este mismo rango, para no confundir con una grilla
// que cambia de alto según lo que se configuró.
const HORA_INICIO = 8;
const HORA_FIN = 20;
const PX_POR_HORA = 64;

// MINI_HEADER_PX — alto FIJO del mini-header "Ver eventos →" de un tramo
// "combinado" (corrección de QA, 2026-09-02/03, ver "foto_incosistencia_5/6.png"
// en docs/): "sin importar que horas de los 2 horarios reservados se
// solapen, se tiene que ver así en general, para cualquier tipo de
// solapamiento". Tres vueltas de corrección para llegar acá:
//   1. Antes el bloque entero ocupaba la altura ENTERA del solapamiento
//      (24px para 15 minutos, 192px para 3 horas) — proporciones muy
//      distintas según cuánto durara, inconsistente.
//   2. Se agregó un mini-header fijo arriba MÁS un "cuerpo" de otro color
//      abajo — se leía como "una tarjeta dentro de la otra tarjeta"
//      (textual del cliente).
//   3. Con el header recién en la INTERSECCIÓN exacta de las reglas (no
//      en el inicio de la más temprana de todas), su posición dentro de
//      la tarjeta seguía cambiando según qué regla empezara antes — "el
//      ver eventos cambia según los horarios... entienda que esto NO
//      debe ser así".
// La versión final agrupa por CLUSTER (unión de reglas que se tocan
// transitivamente, ver bloqueosParaVisualizar) en vez de por intersección
// exacta: el header queda SIEMPRE en el inicio del cluster entero (la
// regla que empieza más temprano, sea cual sea), con esta altura fija
// (recortada solo si el cluster entero mide menos) — el resto del
// cluster, si sobra, se dibuja aparte como una franja lisa (mismo
// criterio que "Postturno" en los turnos), nunca dentro del mismo botón.
const MINI_HEADER_PX = 24;

// Geometría de columnas — exportada para que calendar-view.tsx (el dueño
// del scroll, rediseño 2026-08-27) pueda calcular a qué posición de
// scroll corresponde "hoy" o un día con turnos, sin adivinar/duplicar
// estos números.
export const GUTTER_PX = 64;
export const COL_PX = 130;

// horaAMinutos/minutosAHoraDecimal — "HH:MM" (BloqueoHorario/HorarioAtencion,
// F2.3) a minutos desde medianoche, para comparar rangos y calcular
// posiciones en la grilla con la misma unidad que las horas enteras de
// abajo (HORA_INICIO/HORA_FIN, ahora también derivadas de "HH:MM").
function horaAMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// minutosAHora — inversa de horaAMinutos, para anunciar el tramo REAL
// que dibuja cada segmento (corrección de QA, 2026-08-30): un bloque
// "combinado" dibuja solo el tramo donde dos o más reglas se solapan,
// que puede ser más chico que el horario propio de cualquiera de ellas
// — el aria-label tiene que describir lo que realmente se ve, no el
// rango completo de ninguna regla en particular.
function minutosAHora(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// turnoResuelto — mismo criterio derivado que ya usan TurnoDetalle/
// turnos-table.tsx (agendado + hora de fin ya pasada, nunca un estado real
// en la base). Un turno en conflicto que llega a resolverse deja de
// necesitar acción — pedido explícito del cliente, 2026-09-04: "que los
// turnos en conflicto con un horario reservado pasen a resueltos... dejar
// de decir turno en conflicto, sino pasar a decir X turnos resueltos,
// dado el caso de agendar algo con reserva y al final no hacer nada con
// eso" — ver la pista del cuerpo más abajo, que separa `seg.turnos` en
// estos dos grupos.
function turnoResuelto(t: Turno): boolean {
  return Boolean(t.horaFin) && new Date(t.horaFin!).getTime() < Date.now();
}

// SegmentoBloqueo — un TRAMO de horario reservado (o de conflicto con un
// turno) listo para dibujar (corrección de QA, 2026-08-30 a 2026-09-03,
// sobre la regla de solapamiento de TR-084 — ver los mockups del cliente
// en docs/, "foto_incosistencia_5.png" y "foto_incosistencia_6.png" las
// últimas; paso 2 — conflictos con turnos — agregado 2026-09-04). `reglas`
// trae la o las reglas que corresponde mostrar al hacer click; `turnos`
// trae los turnos en conflicto, si los hay (vacío salvo en "conflicto").
//   - "normal": una regla sola, sin solaparse con ninguna otra cosa ese
//     día (ni otra regla ni un turno) — su rango completo, con su propio
//     motivo, como siempre.
//   - "combinado": DOS O MÁS reglas que se solapan entre sí — directa o
//     transitivamente — sin que ningún turno esté involucrado.
//   - "conflicto": el mismo CLUSTER (ver agruparEnClusters más abajo),
//     pero con UNO O MÁS turnos adentro además de una o más reglas —
//     "si un horario reservado se solapa con un turno, mostrar esta
//     tarjeta de ver eventos, ya sea que sea un horario reservado que se
//     solapa con el turno o más" (textual del cliente): se reutiliza EL
//     MISMO mini-header/tarjeta que "combinado", nunca el viejo diseño de
//     turno rayado — la única diferencia visual es la pista del cuerpo
//     (círculo rojo "X turnos en conflicto" además del círculo gris "X
//     horarios reservados").
// En "combinado"/"conflicto", `desde`/`hasta` son los bordes del cluster
// ENTERO (el inicio de lo que empieza más temprano entre TODOS sus
// miembros — reglas y turnos por igual —, el final de lo que termina más
// tarde) — nunca la intersección exacta de un par en particular, que es
// justo lo que hacía que el mini-header "Ver eventos →" apareciera en una
// posición distinta según qué regla empezara antes ("el ver eventos
// cambia según los horarios... entienda que esto NO debe ser así",
// textual del cliente). Al dibujarse (ver el render en CalendarGrid), el
// mini-header queda SIEMPRE en el borde de arriba del cluster, con altura
// fija — nunca varía según el solapamiento sea de 15 minutos o de 3
// horas. El click abre el modal combinado (bloqueo-detalle-modal.tsx) con
// la lista completa de reglas del cluster (`reglas`, CADA UNA con su
// propio horario y motivo real) y, si corresponde, la lista de turnos en
// conflicto (`turnos`) con el aviso de hablar con el paciente.
// Un cluster de un solo TURNO sin ninguna regla no genera ningún
// SegmentoBloqueo — ese turno se sigue dibujando en el loop de turnos de
// siempre, sin ningún cambio (ver turnosEnConflictoIds más abajo).
interface SegmentoBloqueo {
  id: string;
  reglas: BloqueoHorario[];
  turnos: Turno[];
  desde: number;
  hasta: number;
  variante: "normal" | "combinado" | "conflicto";
  motivo?: string;
}

// ItemSolapable — un miembro cualquiera de un cluster: una regla de
// bloqueo O un turno (nunca los dos a la vez), con su intervalo en
// minutos-desde-medianoche ya resuelto para poder compararlo con
// cualquier otro miembro sin importar de dónde salió. `esGeneral` solo
// tiene sentido para reglas (una general vs. una específica); en un item
// de turno queda simplemente en `false`, sin usarse.
interface ItemSolapable {
  id: string;
  bloqueo?: BloqueoHorario;
  turno?: Turno;
  intervalo: { desde: number; hasta: number };
  esGeneral: boolean;
}

// agruparEnClusters — agrupamiento clásico de "merge overlapping
// intervals": ordena por inicio y va extendiendo un cluster mientras el
// siguiente item empiece ANTES de que termine el más tardío ya visto —
// así agarra también solapamientos TRANSITIVOS (A con B, B con C, aunque
// A y C no se toquen directamente entre sí). El resultado de cada
// cluster es simplemente la unión de los rangos de sus miembros: nunca
// queda ningún tramo de ningún miembro afuera del cluster que le tocó.
// Desde el paso 2 (conflictos con turnos) los `items` pueden mezclar
// reglas de bloqueo y turnos por igual — el algoritmo no distingue: si un
// turno se solapa con una regla, o incluso con OTRA regla a través de un
// turno puente (ej. regla 9:00–9:30, turno 9:15–10:15, regla 10:00–10:30),
// las tres caen en el mismo cluster, tal como corresponde a un
// agrupamiento transitivo real.
function agruparEnClusters(items: ItemSolapable[]): ItemSolapable[][] {
  const ordenados = [...items].sort((a, b) => a.intervalo.desde - b.intervalo.desde);
  const clusters: ItemSolapable[][] = [];
  let clusterActual: ItemSolapable[] = [];
  let hastaMax = -Infinity;

  for (const item of ordenados) {
    if (clusterActual.length > 0 && item.intervalo.desde < hastaMax) {
      clusterActual.push(item);
    } else {
      if (clusterActual.length > 0) clusters.push(clusterActual);
      clusterActual = [item];
    }
    hastaMax = Math.max(hastaMax, item.intervalo.hasta);
  }
  if (clusterActual.length > 0) clusters.push(clusterActual);
  return clusters;
}

// segmentosParaVisualizar — resuelve qué horarios reservados (y, desde el
// paso 2, qué conflictos con turnos) aplican a UN día concreto y cómo
// dibujar cada uno. Agrupa por CLUSTER (ver agruparEnClusters), mezclando
// reglas de bloqueo Y turnos en el mismo agrupamiento — un cluster de:
//   - solo 1 regla → "normal" (como siempre).
//   - 2+ reglas, sin turnos → "combinado" (como siempre).
//   - 1+ regla(s) Y 1+ turno(s) → "conflicto" (paso 2): mismo mini-header
//     "Ver eventos →" que "combinado", con la pista roja de turnos además
//     de la gris de horarios reservados. `reglas`/`turnos` del segmento
//     traen cada lista por separado — un turno nunca reemplaza a una
//     regla en el modal, se agregan aparte, con su propio formato.
//   - solo 1 turno, sin ninguna regla → no genera segmento (`null`,
//     filtrado): ese turno no está en conflicto con nada, se dibuja en el
//     loop de turnos de siempre, sin pasar por acá. Dos turnos no pueden
//     compartir cluster sin una regla de por medio — la base de datos ya
//     impide que dos turnos agendados se solapen entre sí.
// `desde`/`hasta` (en "combinado"/"conflicto") son los bordes del cluster
// ENTERO (la unión de TODOS sus miembros, reglas y turnos por igual) —
// así el mini-header que lo representa siempre arranca en el mismo lugar
// relativo (el borde de arriba del cluster), sin importar cuál miembro en
// particular empieza más temprano. El orden de la lista de reglas (se ve
// en el modal al hacer click) sigue el mismo criterio ya validado por el
// cliente: las generales primero, y entre iguales, la que empieza antes;
// los turnos van ordenados por su propia hora de inicio. El cálculo de
// disponibilidad real para reservar (ver disponibilidad.go) no depende de
// nada de esto — ahí todas las reglas simplemente se unen, sin ninguna
// prioridad (TR-086/087 en docs/tradeoffs.md).
function segmentosParaVisualizar(
  dia: Date,
  generales: BloqueoHorario[],
  especificas: BloqueoHorario[],
  turnosDelDia: Turno[],
): SegmentoBloqueo[] {
  const fechaDia = fechaISOLocal(dia);
  const diaSemana = dia.getDay();

  const especificasDelDia = especificas.filter((b) => b.fecha === fechaDia);

  const generalesDelDia = generales.filter((b) => {
    if (b.diaSemana !== diaSemana) return false;
    if (b.alcance === "todos") return true;
    if (!b.fechaDesde || !b.fechaHasta) return false;
    return fechaDia >= b.fechaDesde && fechaDia <= b.fechaHasta;
  });

  const items: ItemSolapable[] = [
    ...generalesDelDia.map((b) => ({ id: b.id, bloqueo: b, intervalo: { desde: horaAMinutos(b.horaDesde), hasta: horaAMinutos(b.horaHasta) }, esGeneral: true })),
    ...especificasDelDia.map((b) => ({ id: b.id, bloqueo: b, intervalo: { desde: horaAMinutos(b.horaDesde), hasta: horaAMinutos(b.horaHasta) }, esGeneral: false })),
    // minutosDesdeMedianocheCordoba, no `.getHours()/.getMinutes()` — mismo
    // motivo que en el loop de turnos más abajo (bug real de hidratación,
    // 2026-08-30): así el intervalo de un turno queda en la misma unidad
    // (minutos desde medianoche en Córdoba) que el de una regla, y son
    // directamente comparables entre sí.
    ...turnosDelDia
      .filter((t): t is Turno & { horaInicio: string; horaFin: string } => Boolean(t.horaInicio && t.horaFin))
      .map((t) => ({
        id: t.id,
        turno: t,
        intervalo: {
          desde: minutosDesdeMedianocheCordoba(new Date(t.horaInicio)),
          hasta: minutosDesdeMedianocheCordoba(new Date(t.horaFin)),
        },
        esGeneral: false,
      })),
  ];
  if (items.length === 0) return [];

  return agruparEnClusters(items)
    .map((cluster, i): SegmentoBloqueo | null => {
      const bloqueoItems = cluster.filter((it): it is ItemSolapable & { bloqueo: BloqueoHorario } => it.bloqueo !== undefined);
      const turnoItems = cluster
        .filter((it): it is ItemSolapable & { turno: Turno } => it.turno !== undefined)
        .sort((a, b) => a.intervalo.desde - b.intervalo.desde);

      // Cluster de un solo turno, sin ninguna regla — no es un conflicto,
      // se dibuja como turno normal (ver turnosEnConflictoIds en el
      // render de CalendarGrid).
      if (bloqueoItems.length === 0) return null;

      const desde = Math.min(...cluster.map((it) => it.intervalo.desde));
      const hasta = Math.max(...cluster.map((it) => it.intervalo.hasta));

      // Orden de la lista de reglas (se ve en el modal al hacer click):
      // las generales primero (regla ya validada por el cliente para el
      // par general+específica — "la específica debe ganar a la general
      // solo si la abarca por completo", TR-087), y entre iguales, la que
      // empieza antes — no hay otra jerarquía posible entre dos generales
      // o dos específicas.
      const reglasOrdenadas = [...bloqueoItems].sort((x, y) =>
        x.esGeneral === y.esGeneral ? x.intervalo.desde - y.intervalo.desde : x.esGeneral ? -1 : 1,
      );

      if (turnoItems.length > 0) {
        return {
          id: `conflicto-${i}`,
          reglas: reglasOrdenadas.map((it) => it.bloqueo),
          turnos: turnoItems.map((it) => it.turno),
          desde,
          hasta,
          variante: "conflicto",
        };
      }

      if (bloqueoItems.length === 1) {
        const item = bloqueoItems[0];
        return { id: item.id, reglas: [item.bloqueo], turnos: [], ...item.intervalo, variante: "normal", motivo: item.bloqueo.motivo };
      }

      return {
        id: `combinado-${i}`,
        reglas: reglasOrdenadas.map((it) => it.bloqueo),
        turnos: [],
        desde,
        hasta,
        variante: "combinado",
      };
    })
    .filter((seg): seg is SegmentoBloqueo => seg !== null);
}

interface CalendarGridProps {
  dias: Date[];
  turnos: Turno[];
  tiposConsulta: TipoConsulta[];
  onTurnoClick: (turno: Turno) => void;
  // F2.3.8: reglas de bloqueo, para pintar los tramos bloqueados en gris
  // oscuro — el rango de horas del grid en sí NO depende de esto (ver
  // el comentario de HORA_INICIO/HORA_FIN arriba). Opcionales con
  // default `[]` — CalendarGrid se sigue usando igual en cualquier lugar
  // que todavía no tenga estos datos a mano.
  bloqueosGenerales?: BloqueoHorario[];
  bloqueosEspecificas?: BloqueoHorario[];
  // onBloqueoClick recibe SIEMPRE una lista de reglas (corrección de QA,
  // 2026-08-31): un solo elemento para un tramo "normal", dos o más para
  // un tramo "combinado" — "que al tocar en el centro muestre la
  // combinación de horarios reservados... el botón para redirigirse a
  // cada una", ya no un aviso de solapamiento con una regla "principal"
  // y otra "de abajo". Tercer parámetro agregado en el paso 2: los turnos
  // en conflicto del mismo cluster (vacío salvo en "conflicto") — así
  // calendar-view.tsx puede abrir el modal combinado con ambas listas.
  onBloqueoClick?: (reglas: BloqueoHorario[], dia: Date, turnosEnConflicto?: Turno[]) => void;
}

// Grilla de horas (T2.3: "similar a FullCalendar/react-big-calendar" —
// toolbar arriba, grilla de horas a la izquierda). El contenedor de
// altura fija con scroll interno propio vive en CalendarView (el padre);
// acá solo el contenido que se scrollea.
export function CalendarGrid({
  dias,
  turnos,
  tiposConsulta,
  onTurnoClick,
  bloqueosGenerales = [],
  bloqueosEspecificas = [],
  onBloqueoClick,
}: CalendarGridProps) {
  const horas = Array.from({ length: HORA_FIN - HORA_INICIO + 1 }, (_, i) => HORA_INICIO + i);
  const alturaTotal = (HORA_FIN - HORA_INICIO) * PX_POR_HORA;
  const tipoPorId = new Map(tiposConsulta.map((t) => [t.id, t]));

  // Min-width propio del contenido (rediseño 2026-08-27, pedido
  // explícito del cliente: "moverse dentro del calendario", no de la
  // página — reemplaza la clase `.panel-cal-min-w`/TR-029, que forzaba
  // este mismo número sobre TODA la fila título+toolbar+calendario).
  // Solo hace falta en Semana (varios días a la vez, cada
  // columna necesita ~130px para ser legible) — Día es una sola columna,
  // se estira sola sin necesitar ningún piso. El div de más abajo
  // (`flex`) es el que de verdad recibe este ancho: su contenedor
  // (la caja de calendar-view.tsx) es quien scrollea horizontal cuando
  // corresponde, nunca la página.
  const anchoMinPx = dias.length > 1 ? GUTTER_PX + dias.length * COL_PX : undefined;

  return (
    <div className="flex" style={anchoMinPx ? { minWidth: anchoMinPx } : undefined}>
      {/* F2.1 (docs/implementation-plan.md §11, pedido explícito del
          cliente): "si me muevo horizontalmente, al costado los horarios
          me van siguiendo" — columna de horas fija en X (`sticky left-0`)
          sin fijarse en Y (deja que las horas se desplacen verticalmente
          con el resto, como siempre). `bg-marfil` explícito: sin esto, un
          bloque de turno con color propio se transparentaría por debajo
          al quedar esta columna pegada encima suyo durante el scroll
          horizontal. */}
      <div className="sticky left-0 z-10 w-16 flex-shrink-0 bg-marfil">
        {/* Esquina — única celda fija en LOS DOS ejes a la vez
            (intersección de la columna de horas y la fila de días). */}
        <div className="sticky top-0 z-20 h-10 border-b border-arena bg-marfil" />
        <div className="relative" style={{ height: alturaTotal }}>
          {/* `-translate-y-1/2` centra cada hora SOBRE su línea de grilla
              (mitad arriba, mitad abajo) — funciona bien para todas
              salvo la primera (08:00, `i === 0`): esa mitad de arriba
              cae fuera de este contenedor, en el territorio de la
              esquina fija de arriba (F2.1, `sticky top-0` + fondo
              opaco) — antes de F2.1 esa esquina no tenía fondo propio,
              así que la mitad superior de "08:00" se veía igual por
              encima; ahora la esquina la tapa (bug reportado
              2026-08-29, tanto en mobile como en escritorio). Sin el
              translate, la primera hora queda completa debajo de la
              esquina en vez de a caballo del borde — el resto de las
              horas no cambia. */}
          {horas.map((h, i) => (
            <span
              key={h}
              style={{ top: i * PX_POR_HORA }}
              className={`absolute right-2 font-[family-name:var(--font-mono)] text-xs text-grafito/60 ${i === 0 ? "" : "-translate-y-1/2"}`}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
      </div>

      {/* minmax(0, 1fr): el `minWidth` de arriba (`anchoMinPx`) fuerza el
          ANCHO TOTAL de este `flex` cuando hay más de un día — estas
          columnas simplemente se reparten ese ancho ya forzado, `1fr`
          alcanza, sin piso propio por columna. */}
      <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
        {dias.map((dia) => {
          const turnosDelDia = turnos.filter((t) => t.horaInicio && isSameDay(new Date(t.horaInicio), dia));
          const bloqueosDelDia = segmentosParaVisualizar(dia, bloqueosGenerales, bloqueosEspecificas, turnosDelDia);
          // Turnos absorbidos por un segmento "conflicto" (paso 2): se
          // dibujan DENTRO de esa tarjeta combinada, no en el loop de
          // turnos de siempre — evita duplicarlos en el grid.
          const turnosEnConflictoIds = new Set(
            bloqueosDelDia.filter((seg) => seg.variante === "conflicto").flatMap((seg) => seg.turnos.map((t) => t.id)),
          );
          return (
            <div key={dia.toISOString()} className="border-l border-arena first:border-l-0">
              {/* F2.1: "verticalmente los días [me acompañan]" — fila de
                  día fija en Y (`sticky top-0`) sin fijarse en X (cada
                  columna sigue desplazándose horizontalmente con el
                  resto del grid, como siempre). `bg-marfil` explícito
                  por el mismo motivo que la columna de horas. */}
              <div className="sticky top-0 z-10 flex h-10 items-center justify-center border-b border-arena bg-marfil font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-grafito/60">
                {formatDiaCorto(dia)}
              </div>
              <div
                className="relative"
                style={{
                  height: alturaTotal,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--color-arena) 0, var(--color-arena) 1px, transparent 1px, transparent ${PX_POR_HORA}px)`,
                }}
              >
                {/* F2.3.8: horarios bloqueados en gris oscuro, DEBAJO de
                    los turnos (se renderizan antes en el DOM) — un turno
                    real siempre tiene que poder verse encima de un
                    bloqueo, nunca al revés. */}
                {bloqueosDelDia.map((seg) => {
                  const top = (seg.desde / 60 - HORA_INICIO) * PX_POR_HORA;
                  const alto = ((seg.hasta - seg.desde) / 60) * PX_POR_HORA;

                  if (seg.variante === "combinado" || seg.variante === "conflicto") {
                    // Mini-header FIJO en el borde de ARRIBA del cluster
                    // entero (corrección de QA, 2026-09-02/03, ver
                    // "foto_incosistencia_5/6.png" en docs/): siempre la
                    // misma altura, recortada solo si el cluster entero
                    // mide menos que eso — nunca varía según qué regla
                    // empiece antes ni cuánto dure el solapamiento, ni
                    // según si el cluster es "combinado" o "conflicto"
                    // (paso 2): se reutiliza EXACTAMENTE el mismo
                    // mini-header/tarjeta en los dos casos — "sea lo que
                    // sea con lo que se solapen los horarios reservados se
                    // mostrará la tarjeta que acabamos de implementar"
                    // (textual del cliente). Lo que sobra del cluster por
                    // debajo del header (si sobra) se dibuja APARTE, como
                    // un elemento hermano — nunca anidado dentro del mismo
                    // botón (eso se leía como "una tarjeta dentro de la
                    // otra tarjeta", corrección de QA anterior).
                    const altoHeader = Math.min(MINI_HEADER_PX, alto);
                    const altoResto = alto - altoHeader;
                    // Turnos del cluster, separados en los dos grupos que
                    // pide el cliente (ver turnoResuelto más arriba): los
                    // que todavía necesitan una decisión ("en conflicto",
                    // círculo rojo) y los que ya pasaron sin que se haya
                    // hecho nada con la reserva ("resueltos", círculo
                    // gris — mismo tono que "horarios reservados", ya no
                    // es un aviso urgente).
                    const turnosEnConflicto = seg.turnos.filter((t) => !turnoResuelto(t));
                    const turnosResueltos = seg.turnos.filter(turnoResuelto);
                    return (
                      <Fragment key={seg.id}>
                        {/* Redondeo (corrección de QA, 2026-09-04: "el
                            turno y el postturno aparecen como en 2
                            tarjetas diferentes... no hay una forma de
                            unir estas 2 tarjetas en una sola") — el
                            mini-header y el "resto" de abajo son
                            contiguos en píxeles (cero gap real), pero
                            cada uno redondeando las CUATRO esquinas hacía
                            un pellizco visual justo en la unión, como si
                            fueran dos tarjetas separadas. Con el header
                            redondeado solo arriba (`rounded-t-field`) y
                            el resto solo abajo (`rounded-b-field`, más
                            abajo), el conjunto se ve como una sola
                            tarjeta con dos colores — nunca dos tarjetas
                            distintas. Sin `altoResto` (el cluster entero
                            entra en el header), sigue redondeando las
                            cuatro esquinas como siempre. */}
                        <button
                          type="button"
                          onClick={() => onBloqueoClick?.(seg.reglas, dia, seg.turnos)}
                          aria-label={`Horario bloqueado de ${minutosAHora(seg.desde)} a ${minutosAHora(seg.hasta)}`}
                          style={{ top, height: altoHeader }}
                          className={`absolute inset-x-1 overflow-hidden bg-grafito/60 px-2 py-1 text-left text-xs font-medium text-marfil hover:bg-grafito/70 ${
                            altoResto > 0 ? "rounded-t-field" : "rounded-field"
                          }`}
                        >
                          Ver eventos →
                        </button>
                        {/* Pista en el cuerpo (corrección de QA,
                            2026-09-03, ampliada para el paso 2 y para la
                            transición a resuelto): "dar indicios de lo que
                            son... (círculo rojo) x turnos en
                            conflicto... (círculo más gris) x horarios
                            reservados" — el círculo rojo solo aparece si
                            queda algún turno TODAVÍA sin resolver; uno ya
                            resuelto pasa a su propia línea gris ("X turnos
                            resueltos"), nunca sigue contando como
                            conflicto activo. El gris de horarios
                            reservados sigue siempre que haya reglas, como
                            antes. Decorativo, como "Postturno" en los
                            turnos, no interactivo (el click sigue siendo
                            el mini-header de arriba). */}
                        {altoResto > 0 && (
                          <div
                            aria-hidden="true"
                            style={{ top: top + altoHeader, height: altoResto }}
                            className="absolute inset-x-1 flex flex-col justify-center gap-0.5 overflow-hidden rounded-b-field bg-grafito/10 px-2 py-0.5"
                          >
                            {turnosEnConflicto.length > 0 && (
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-terracota" />
                                <span className="truncate text-[10px] font-medium text-grafito/60">
                                  {turnosEnConflicto.length} {turnosEnConflicto.length === 1 ? "turno en conflicto" : "turnos en conflicto"}
                                </span>
                              </span>
                            )}
                            {turnosResueltos.length > 0 && (
                              <span className="flex items-center gap-1.5">
                                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-grafito/40" />
                                <span className="truncate text-[10px] font-medium text-grafito/60">
                                  {turnosResueltos.length} {turnosResueltos.length === 1 ? "turno resuelto" : "turnos resueltos"}
                                </span>
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-grafito/40" />
                              <span className="truncate text-[10px] font-medium text-grafito/60">
                                {seg.reglas.length} {seg.reglas.length === 1 ? "horario reservado" : "horarios reservados"}
                              </span>
                            </span>
                          </div>
                        )}
                      </Fragment>
                    );
                  }

                  return (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => onBloqueoClick?.(seg.reglas, dia, seg.turnos)}
                      aria-label={`Horario bloqueado de ${minutosAHora(seg.desde)} a ${minutosAHora(seg.hasta)}`}
                      style={{ top, height: alto }}
                      className="absolute inset-x-1 overflow-hidden rounded-field bg-grafito/25 px-2 py-1 text-left text-xs hover:bg-grafito/35"
                    >
                      {seg.motivo && <span className="block truncate font-medium text-marfil">{seg.motivo}</span>}
                    </button>
                  );
                })}
                {/* Turnos en conflicto (paso 2) se excluyen de este loop —
                    ya se dibujan dentro de su tarjeta "Ver eventos →" de
                    arriba, ver turnosEnConflictoIds. */}
                {turnosDelDia.filter((t) => !turnosEnConflictoIds.has(t.id)).map((t) => {
                  if (!t.horaInicio || !t.horaFin) return null;
                  const inicio = new Date(t.horaInicio);
                  const fin = new Date(t.horaFin);
                  // minutosDesdeMedianocheCordoba (bug real, 2026-08-30:
                  // "al refrescar la página" los turnos aparecían corridos
                  // ~3hs), no `.getHours()/.getMinutes()` directo — ver el
                  // comentario grande de esa función en calendar-utils.ts.
                  const top = (minutosDesdeMedianocheCordoba(inicio) / 60 - HORA_INICIO) * PX_POR_HORA;
                  const alto = Math.max(
                    ((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60)) * PX_POR_HORA,
                    22,
                  );
                  // Resuelto (pedido explícito del cliente, 2026-08-23): un
                  // turno cuya hora de fin ya pasó se pinta en gris neutro,
                  // sin importar su tipo de consulta — deja de competir
                  // visualmente con lo que todavía está por venir.
                  const resuelto = fin.getTime() < new Date().getTime();
                  const tipo = t.tipoConsultaId ? tipoPorId.get(t.tipoConsultaId) : undefined;
                  const tema = temaTipoConsulta(tipo);
                  // Tiempo post-consulta (corrección de QA, F2.3): "debe
                  // aparecer ligado junto al turno, pero de un color más
                  // opaco [apagado] que el color del tipo de consulta
                  // referente" — un segundo bloque, pegado justo debajo,
                  // con el mismo color de fondo atenuado (opacity), sin
                  // texto ni click propio: no es un turno, es el margen de
                  // limpieza/orden que ese turno le deja ocupado a la
                  // agenda (ver disponibilidad.go, el mismo tiempo que
                  // /disponibilidad ya descuenta al calcular horarios).
                  const tiempoPost = tipo?.tiempoPostConsultaMinutos ?? 0;
                  const altoPost = (tiempoPost / 60) * PX_POR_HORA;
                  // hayPost — mismo criterio de redondeo que el mini-header/
                  // resto de arriba (corrección de QA, 2026-09-04): "el
                  // turno y el postturno aparecen como en 2 tarjetas
                  // diferentes... unir estas 2 tarjetas en una sola,
                  // manteniendo la diferencia de colores". Son contiguos en
                  // píxeles desde siempre (top+alto del turno = top del
                  // postturno); lo que los hacía leerse como dos tarjetas
                  // separadas era que cada uno redondeaba las CUATRO
                  // esquinas — con el turno redondeado solo arriba y el
                  // postturno solo abajo, el conjunto se ve como una sola
                  // tarjeta con un segundo tono debajo, nunca dos.
                  const hayPost = tiempoPost > 0 && !resuelto;
                  return (
                    <div key={t.id}>
                      <button
                        type="button"
                        onClick={() => onTurnoClick(t)}
                        style={{ top, height: alto, background: resuelto ? "var(--color-arena)" : tema.fondo }}
                        className={`absolute inset-x-1 overflow-hidden border px-2 py-1 text-left text-xs hover:brightness-95 ${
                          hayPost ? "rounded-t-field" : "rounded-field"
                        } ${resuelto ? "border-arena text-grafito/60" : "border-transparent"}`}
                      >
                        <span className="block truncate font-semibold" style={resuelto ? undefined : { color: tema.texto }}>
                          {t.nombreContacto} {t.apellidoContacto}
                        </span>
                        <span className="block truncate" style={resuelto ? undefined : { color: tema.texto }}>
                          {formatHora(inicio)}
                        </span>
                      </button>
                      {hayPost && (
                        // Texto "Postturno Xmin" (corrección de QA, F2.3):
                        // "así el profesional sabe de dónde sale esa
                        // barrita más opaca" — antes era un bloque sin
                        // ningún texto, solo el color atenuado.
                        <div
                          aria-hidden="true"
                          style={{ top: top + alto, height: altoPost, background: tema.fondo, opacity: 0.45 }}
                          className="absolute inset-x-1 overflow-hidden rounded-b-field px-2 py-0.5"
                        >
                          <span className="block truncate text-[10px] font-medium leading-tight" style={{ color: tema.texto }}>
                            Postturno {tiempoPost}min
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
