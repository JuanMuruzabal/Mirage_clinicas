import type { CSSProperties } from "react";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { formatDiaCorto, formatHora, isSameDay } from "@/lib/calendar-utils";
import { temaTipoConsulta } from "@/lib/turno-format";

const HORA_INICIO = 8;
const HORA_FIN = 20;
const PX_POR_HORA = 64;
const GUTTER_HORAS_PX = 64; // ancho de w-16, la columna de horas a la izquierda

// Anchos aproximados de escritorio (rama fix/mobile, corrección
// 2026-08-24 — ver TR-025 en docs/tradeoffs.md): en vista Día hay una
// sola columna que en escritorio ocupa casi todo el ancho disponible del
// panel (fácil ~700-900px); en vista Semana, cada una de las 7 columnas
// suele rondar los 200px. Estos dos números son la aproximación de "cómo
// se ve en escritorio" que se fuerza como ancho mínimo en mobile — no
// hace falta que coincidan pixel a pixel con ningún monitor real, alcanza
// con que el contenido deje de sentirse apretado.
const ANCHO_MIN_VISTA_DIA_PX = 720;
const ANCHO_MIN_POR_COLUMNA_PX = 200;

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

  // Ancho mínimo total del contenido (gutter de horas + columnas de día),
  // forzado SOLO debajo de 768px vía la variable CSS que lee
  // .panel-calendar-dias en globals.css — arriba de ese breakpoint la
  // variable no existe y este número no tiene ningún efecto, cero cambio
  // de escritorio. Debajo, obliga a que el contenido sea más ancho que
  // la pantalla a propósito, para que se navegue deslizando en vez de
  // comprimirse (pedido explícito del cliente, rama fix/mobile).
  const anchoMinDias = dias.length === 1 ? ANCHO_MIN_VISTA_DIA_PX : dias.length * ANCHO_MIN_POR_COLUMNA_PX;
  const anchoMinTotalPx = GUTTER_HORAS_PX + anchoMinDias;

  return (
    <div
      className="panel-calendar-dias flex"
      style={{ "--panel-calendar-min-w": `${anchoMinTotalPx}px` } as CSSProperties}
    >
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

      {/* minmax(0, 1fr) — sin variable CSS ni piso propio acá (corrección
          2026-08-24, rama fix/mobile, ver TR-025 en docs/tradeoffs.md):
          el ancho mínimo ya no se aplica columna por columna, se aplica
          UNA vez al contenedor entero de arriba (`anchoMinTotalPx`) — así
          también funciona para la vista Día (una sola columna, donde un
          piso por-columna no alcanzaba a forzar nada porque 1fr con una
          sola pista siempre gana igual). Con el contenedor ya forzado a
          ser ancho en mobile, estas columnas se reparten ese ancho con
          total normalidad vía 1fr — es la misma expresión que tenía el
          código antes de cualquier cambio mobile, sin ningún condicional
          propio. */}
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
