import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { formatDiaCorto, formatHora, isSameDay } from "@/lib/calendar-utils";
import { temaTipoConsulta } from "@/lib/turno-format";

const HORA_INICIO = 8;
const HORA_FIN = 20;
const PX_POR_HORA = 64;

// Geometría de columnas — exportada para que calendar-view.tsx (el dueño
// del scroll, rediseño 2026-08-27) pueda calcular a qué posición de
// scroll corresponde "hoy" o un día con turnos, sin adivinar/duplicar
// estos números.
export const GUTTER_PX = 64;
export const COL_PX = 130;

interface CalendarGridProps {
  dias: Date[];
  turnos: Turno[];
  tiposConsulta: TipoConsulta[];
  onTurnoClick: (turno: Turno) => void;
}

// Grilla de horas (T2.3: "similar a FullCalendar/react-big-calendar" —
// toolbar arriba, grilla de horas a la izquierda). El contenedor de
// altura fija con scroll interno propio vive en CalendarView (el padre);
// acá solo el contenido que se scrollea.
export function CalendarGrid({ dias, turnos, tiposConsulta, onTurnoClick }: CalendarGridProps) {
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
                {turnosDelDia.map((t) => {
                  if (!t.horaInicio || !t.horaFin) return null;
                  const inicio = new Date(t.horaInicio);
                  const fin = new Date(t.horaFin);
                  const top = (inicio.getHours() + inicio.getMinutes() / 60 - HORA_INICIO) * PX_POR_HORA;
                  const alto = Math.max(
                    ((fin.getTime() - inicio.getTime()) / (1000 * 60 * 60)) * PX_POR_HORA,
                    22,
                  );
                  // Resuelto (pedido explícito del cliente, 2026-08-23): un
                  // turno cuya hora de fin ya pasó se pinta en gris neutro,
                  // sin importar su tipo de consulta — deja de competir
                  // visualmente con lo que todavía está por venir.
                  const resuelto = fin.getTime() < new Date().getTime();
                  const tema = temaTipoConsulta(t.tipoConsultaId ? tipoPorId.get(t.tipoConsultaId) : undefined);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onTurnoClick(t)}
                      style={{ top, height: alto, background: resuelto ? "var(--color-arena)" : tema.fondo }}
                      className={`absolute inset-x-1 overflow-hidden rounded-field border px-2 py-1 text-left text-xs hover:brightness-95 ${
                        resuelto ? "border-arena text-grafito/60" : "border-transparent"
                      }`}
                    >
                      <span className="block truncate font-semibold" style={resuelto ? undefined : { color: tema.texto }}>
                        {t.nombreContacto} {t.apellidoContacto}
                      </span>
                      <span className="block truncate" style={resuelto ? undefined : { color: tema.texto }}>
                        {formatHora(inicio)}
                      </span>
                    </button>
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
