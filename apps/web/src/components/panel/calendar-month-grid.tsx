import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { hoyEnCordoba, isSameDay } from "@/lib/calendar-utils";
import { temaTipoConsulta } from "@/lib/turno-format";

interface CalendarMonthGridProps {
  dias: Date[];
  mesReferencia: Date;
  turnos: Turno[];
  tiposConsulta: TipoConsulta[];
  onDiaClick: (dia: Date) => void;
}

// Vista Mes: grilla simplificada de 7 columnas — un punto de color por
// turno agendado ese día (hasta 3, "+N" si hay más). Click en un día pasa
// a la vista Día de esa fecha — el detalle hora a hora vive ahí, no acá.
export function CalendarMonthGrid({ dias, mesReferencia, turnos, tiposConsulta, onDiaClick }: CalendarMonthGridProps) {
  const tipoPorId = new Map(tiposConsulta.map((t) => [t.id, t]));
  // hoyEnCordoba() (encontrado investigando un error de hidratación de
  // React, 2026-08-30), no `new Date()` — mismo motivo que en
  // calendar-view.tsx: esto define qué día se resalta como "hoy" y se
  // evalúa tanto en el server (SSR) como al hidratar en el cliente.
  const hoy = hoyEnCordoba();

  return (
    // Sin min-width propio, nunca hizo falta (a diferencia de
    // CalendarGrid en Semana): 7 columnas fluidas (`grid-cols-7`) se
    // reparten cualquier ancho disponible sin necesitar un piso — Mes
    // nunca generó scroll horizontal, ni cuando calendar-view.tsx forzaba
    // un ancho a toda la fila (`panel-cal-min-w`, reemplazado en el
    // rediseño local de 2026-08-27) ni ahora.
    <div className="grid grid-cols-7 border-t border-l border-arena">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
        <div
          key={d}
          className="border-b border-r border-arena bg-marfil py-2 text-center font-[family-name:var(--font-mono)] text-xs uppercase tracking-wide text-grafito/60"
        >
          {d}
        </div>
      ))}

      {dias.map((dia) => {
        const turnosDelDia = turnos.filter((t) => t.horaInicio && isSameDay(new Date(t.horaInicio), dia));
        const fueraDeMes = dia.getMonth() !== mesReferencia.getMonth();
        const esHoy = isSameDay(dia, hoy);

        return (
          <button
            key={dia.toISOString()}
            type="button"
            onClick={() => onDiaClick(dia)}
            className={`flex h-24 flex-col items-start gap-1 border-b border-r border-arena p-2 text-left hover:bg-arena ${
              fueraDeMes ? "bg-arena/20 text-grafito/50" : "bg-marfil text-grafito"
            }`}
          >
            <span className={`text-sm ${esHoy ? "rounded-full border border-salvia bg-salvia-claro px-1.5 font-semibold text-salvia-oscuro" : ""}`}>
              {dia.getDate()}
            </span>
            <div className="flex flex-wrap gap-1">
              {turnosDelDia.slice(0, 3).map((t) => {
                // Mismo criterio que CalendarGrid: un turno resuelto (hora
                // de fin ya pasada) se ve gris, no con el color de su tipo
                // de consulta.
                const resuelto = t.horaFin ? new Date(t.horaFin).getTime() < new Date().getTime() : false;
                const tema = temaTipoConsulta(t.tipoConsultaId ? tipoPorId.get(t.tipoConsultaId) : undefined);
                // Contorno verde/rojo (corrección de QA, mismo criterio
                // que CalendarGrid) — acá el "turno" es un punto de
                // 1.5px, así que el contorno es un anillo alrededor en
                // vez de un borde de tarjeta.
                const anillo =
                  t.asistencia === "asistio"
                    ? "ring-2 ring-salvia-oscuro"
                    : t.asistencia === "ausente"
                      ? "ring-2 ring-terracota-oscuro"
                      : "";
                return (
                  <span
                    key={t.id}
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${anillo}`}
                    style={{ background: resuelto ? "var(--color-arena)" : tema.acento }}
                  />
                );
              })}
              {turnosDelDia.length > 3 && <span className="text-[0.65rem] text-grafito/50">+{turnosDelDia.length - 3}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
