import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { isSameDay } from "@/lib/calendar-utils";
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
  const hoy = new Date();

  return (
    // min-w — corrección 2026-08-24, rama fix/mobile (ver TR-026 en
    // docs/tradeoffs.md): antes era un piso incondicional (490px, en
    // cualquier viewport) — sin ser enorme, tampoco es "que se estire y
    // llene la pantalla", que es el pedido explícito del cliente. Pasa a
    // `max-md:` únicamente: en escritorio ya no tiene ningún min-width
    // propio (el grid-cols-7 se reparte solo, como toda la vida); en
    // mobile, clamp() lo deja llenar hasta ~90% del viewport (para que
    // en un teléfono angosto no desborde de entrada) sin bajar de 280px
    // (7 columnas de ~40px, el piso de legibilidad para el número de
    // día + los puntos de color). El overflow-x-auto de calendar-view.tsx
    // sigue ahí para lo poco que de verdad no entre.
    <div className="grid grid-cols-7 border-t border-l border-arena max-md:min-w-[clamp(280px,90vw,420px)]">
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
                return (
                  <span
                    key={t.id}
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
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
