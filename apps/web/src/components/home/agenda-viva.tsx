import type { CSSProperties } from "react";
import { QuadrantMark } from "@/components/quadrant-mark";
import { IconCheck } from "@/components/icons";
import { IconoCampana } from "./iconos-home";

// AgendaViva — la ilustración del hero: la agenda de un día que se llena
// sola. No es una foto ni una captura: son las mismas piezas del producto
// (el bloque de turno con su marca de cuadrante, el aviso de "Turno
// nuevo") dibujadas con HTML, así que se ven nítidas en cualquier pantalla
// y cuentan lo que PRISMA hace mientras el profesional atiende.
//
// Los turnos entran de a uno y llega el aviso al celular (`.lp-*` en
// app/home.css, un ciclo de 13 s). Con "reducir movimiento" se ve el día
// ya armado.

const ALTO_HORA = 56; // px por hora en el riel
const DESDE = 9;

interface TurnoDeMuestra {
  desde: number; // hora decimal
  hasta: number;
  paciente: string;
  consulta: string;
  origen: string;
}

const TURNOS: TurnoDeMuestra[] = [
  { desde: 9.5, hasta: 10, paciente: "Lucía Fernández", consulta: "Limpieza", origen: "Página pública" },
  { desde: 10.5, hasta: 11.25, paciente: "Martín Gómez", consulta: "Ortodoncia", origen: "Link compartido" },
  { desde: 11.5, hasta: 12, paciente: "Valentina Ríos", consulta: "Consulta general", origen: "Página pública" },
];

function hhmm(h: number): string {
  const horas = Math.floor(h);
  const minutos = Math.round((h - horas) * 60);
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

export function AgendaViva() {
  const horas = [9, 10, 11, 12, 13];
  return (
    <div
      role="img"
      aria-label="La agenda de PRISMA: los turnos entran solos desde tu página y te llega un aviso al celular."
      className="relative mx-auto w-full max-w-[30rem]"
    >
      <div aria-hidden="true" className="rounded-card border-[0.5px] border-arena bg-marfil text-grafito shadow-[0_30px_80px_-30px_rgb(0_0_0/0.55)]">
        <div className="flex items-end justify-between gap-4 border-b-[0.5px] border-arena px-6 pb-4 pt-5">
          <div>
            <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-grafito/55">
              Miércoles 14 · Octubre
            </p>
            <p className="font-[family-name:var(--font-display)] text-3xl font-black uppercase leading-none tracking-tight">
              Tu agenda
            </p>
          </div>
          <div className="hidden gap-1 rounded-full bg-arena/70 p-1 text-[11px] font-semibold sm:flex">
            <span className="rounded-full bg-marfil px-3 py-1 shadow-soft">Día</span>
            <span className="px-3 py-1 text-grafito/55">Semana</span>
            <span className="px-3 py-1 text-grafito/55">Mes</span>
          </div>
        </div>

        <div className="relative px-6 py-5">
          <div className="relative" style={{ height: ALTO_HORA * (horas.length - 1) + 8 }}>
            {horas.map((h, n) => (
              <div key={h} className="absolute inset-x-0 flex items-center gap-3" style={{ top: n * ALTO_HORA }}>
                <span className="w-11 font-[family-name:var(--font-mono)] text-[11px] text-grafito/45">{hhmm(h)}</span>
                <span className="h-px flex-1 bg-arena" />
              </div>
            ))}

            {/* Un horario reservado, que ya estaba: el rayado de siempre. */}
            <div
              className="absolute left-14 right-0 flex items-center rounded-field border border-dashed border-grafito/25 px-3 text-[11px] font-medium text-grafito/50"
              style={{
                top: (12.5 - DESDE) * ALTO_HORA + 4,
                height: ALTO_HORA * 0.5 - 6,
                backgroundImage:
                  "repeating-linear-gradient(-45deg, transparent 0 6px, color-mix(in srgb, var(--color-grafito) 7%, transparent) 6px 8px)",
              }}
            >
              Horario reservado · Almuerzo
            </div>

            {TURNOS.map((t, n) => (
              <div
                key={t.paciente}
                className="lp-turno absolute left-14 right-0 flex items-center gap-3 overflow-hidden rounded-field border border-salvia/40 bg-salvia-claro px-3 text-salvia-oscuro"
                style={
                  {
                    "--i": n,
                    top: (t.desde - DESDE) * ALTO_HORA + 4,
                    height: Math.max((t.hasta - t.desde) * ALTO_HORA - 6, 26),
                  } as CSSProperties
                }
              >
                <QuadrantMark estado="agendado" className="flex-shrink-0 text-[0.8rem]" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  {t.paciente}
                  <span className="font-normal text-salvia-oscuro/70"> · {t.consulta}</span>
                </span>
                <span className="hidden flex-shrink-0 rounded-full bg-marfil/80 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-grafito/60 sm:inline">
                  {t.origen}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* El aviso al celular, como llega de verdad (TR-179). */}
      <div
        aria-hidden="true"
        className="lp-aviso absolute -top-16 right-0 flex w-[17.5rem] max-w-[calc(100%-1rem)] sm:-right-10 sm:-top-8 items-start gap-3 rounded-[16px] border-[0.5px] border-arena bg-marfil/95 p-3 text-grafito shadow-[0_18px_40px_-18px_rgb(0_0_0/0.5)] backdrop-blur sm:-right-10"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-acero-oscuro text-marfil">
          <IconoCampana className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 text-[12.5px] leading-snug">
          <span className="block font-semibold">Turno nuevo · jue 15/10 12:00</span>
          <span className="block truncate text-grafito/65">Camila Ríos · Consulta general</span>
        </span>
      </div>

      <div
        aria-hidden="true"
        className="lp-flotar absolute -bottom-6 -left-4 flex items-center gap-2 rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-[12.5px] font-semibold text-salvia-oscuro shadow-[0_14px_30px_-16px_rgb(0_0_0/0.5)] sm:-left-10"
        style={{ "--retraso": "1.2s" } as CSSProperties}
      >
        <IconCheck className="h-4 w-4" />
        El paciente confirmó su mail
      </div>
    </div>
  );
}
