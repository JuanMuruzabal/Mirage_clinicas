import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { formatDiaCorto, formatHora, isSameDay } from "@/lib/calendar-utils";
import { temaTipoConsulta } from "@/lib/turno-format";

const HORA_INICIO = 8;
const HORA_FIN = 20;
const PX_POR_HORA = 64;

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

  return (
    <div className="flex">
      <div className="w-16 flex-shrink-0">
        <div className="h-10 border-b border-arena" />
        <div className="relative" style={{ height: alturaTotal }}>
          {horas.map((h, i) => (
            <span
              key={h}
              style={{ top: i * PX_POR_HORA }}
              className="absolute right-2 -translate-y-1/2 font-[family-name:var(--font-mono)] text-xs text-grafito/60"
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
      </div>

      {/* minmax(0, 1fr) — la misma expresión de siempre, sin piso propio
          (rama fix/mobile, quinta corrección 2026-08-24 — ver TR-028 en
          docs/tradeoffs.md): el mínimo de ancho ya no se calcula por
          columna acá adentro — se aplica UNA vez a la card entera en
          calendar-view.tsx (`panel-cal-min-w`), mismo criterio que
          `.cal { min-width: 900px }` de la referencia del cliente
          (docs/referencia-para-claude-code.html). Con la card ya forzada
          a ser ancha en mobile, estas columnas se reparten ese ancho con
          total normalidad vía `1fr` — cero diferencia con cómo se
          comporta en escritorio. */}
      <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}>
        {dias.map((dia) => {
          const turnosDelDia = turnos.filter((t) => t.horaInicio && isSameDay(new Date(t.horaInicio), dia));
          return (
            <div key={dia.toISOString()} className="border-l border-arena first:border-l-0">
              <div className="flex h-10 items-center justify-center border-b border-arena font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-grafito/60">
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
