"use client";

import { useRef, type KeyboardEvent } from "react";
import { fechaISOLocal } from "@/lib/calendar-utils";

/**
 * 3.8 — Panel de calendario mensual (docs/prompt-claude-code-fecha-
 * horario.md, punto 1): reemplaza el `<input type="date">` nativo del
 * selector de fecha de [6] — no se puede estilar, se monta encima del
 * contenido con los estilos del sistema operativo del usuario. Se
 * despliega DENTRO del flujo del modal (empuja el contenido hacia
 * abajo), nunca como popover/overlay flotante.
 */

const INICIALES_DIA = ["do", "lu", "ma", "mi", "ju", "vi", "sa"];

interface PanelCalendarioMesProps {
  /** "YYYY-MM" del mes que se está mostrando (no necesariamente el de `fechaSeleccionada` — el panel se puede navegar mes a mes sin mover la selección). */
  mesVisible: string;
  fechaSeleccionada: string;
  /** Fechas "YYYY-MM-DD" del mes visible que tienen algún turno disponible. */
  diasConTurnos: string[];
  cargando: boolean;
  onCambiarMes: (mes: string) => void;
  onSeleccionarDia: (fecha: string) => void;
  onVolverAHoy: () => void;
  onEscape: () => void;
}

function sumarMeses(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function PanelCalendarioMes({
  mesVisible,
  fechaSeleccionada,
  diasConTurnos,
  cargando,
  onCambiarMes,
  onSeleccionarDia,
  onVolverAHoy,
  onEscape,
}: PanelCalendarioMesProps) {
  const hoyISO = fechaISOLocal();
  const [year, month] = mesVisible.split("-").map(Number);
  const primerDia = new Date(year, month - 1, 1);
  const diasEnMes = new Date(year, month, 0).getDate();
  const offsetInicial = primerDia.getDay(); // 0=domingo, la semana del doc empieza domingo
  const diasConTurnosSet = new Set(diasConTurnos);
  const celdasRef = useRef<(HTMLButtonElement | null)[]>([]);

  const celdas = Array.from({ length: diasEnMes }, (_, i) => {
    const dia = i + 1;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    return {
      dia,
      iso,
      pasado: iso < hoyISO,
      hoy: iso === hoyISO,
      conTurnos: diasConTurnosSet.has(iso),
      seleccionado: iso === fechaSeleccionada,
    };
  });

  const hayAlgunaSeleccionada = celdas.some((c) => c.seleccionado);

  function moverFoco(desde: number, delta: number) {
    const destino = desde + delta;
    if (destino < 0 || destino >= celdas.length) return;
    celdasRef.current[destino]?.focus();
  }

  function manejarTecla(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        moverFoco(index, 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        moverFoco(index, -1);
        break;
      case "ArrowDown":
        e.preventDefault();
        moverFoco(index, 7);
        break;
      case "ArrowUp":
        e.preventDefault();
        moverFoco(index, -7);
        break;
      case "Escape":
        e.preventDefault();
        onEscape();
        break;
    }
  }

  const nombreMes = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(primerDia);

  return (
    <div className="rounded-field bg-hueso p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => onCambiarMes(sumarMeses(mesVisible, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-marfil text-grafito"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-grafito capitalize">{nombreMes}</span>
        <button
          type="button"
          aria-label="Mes siguiente"
          onClick={() => onCambiarMes(sumarMeses(mesVisible, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-marfil text-grafito"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-0.5 text-center text-[11px] text-grafito/50">
        {INICIALES_DIA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div role="grid" aria-label={nombreMes} className="mt-1 grid grid-cols-7 gap-0.5">
        {Array.from({ length: offsetInicial }, (_, i) => (
          <span key={`vacio-${i}`} aria-hidden="true" />
        ))}
        {celdas.map((c, index) => {
          const deshabilitado = c.pasado || !c.conTurnos;
          const enFoco = c.seleccionado || (!hayAlgunaSeleccionada && c.hoy) || (!hayAlgunaSeleccionada && index === 0);
          return (
            <button
              key={c.iso}
              ref={(el) => {
                celdasRef.current[index] = el;
              }}
              type="button"
              disabled={deshabilitado}
              tabIndex={enFoco ? 0 : -1}
              onClick={() => onSeleccionarDia(c.iso)}
              onKeyDown={(e) => manejarTecla(e, index)}
              aria-current={c.hoy ? "date" : undefined}
              aria-pressed={c.seleccionado}
              className={`relative flex h-[38px] items-center justify-center rounded-lg text-sm ${
                c.seleccionado
                  ? "bg-salvia-oscuro font-semibold text-marfil"
                  : deshabilitado
                    ? "cursor-not-allowed text-[#BDB3A5]"
                    : "text-grafito hover:bg-arena"
              }`}
              style={c.hoy && !c.seleccionado ? { boxShadow: "inset 0 0 0 1.5px #C9BDAE" } : undefined}
            >
              {c.dia}
              {c.conTurnos && !c.seleccionado && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-salvia-oscuro" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-arena pt-2.5 text-xs">
        <span className="flex items-center gap-1.5 text-grafito/70">
          <span className="h-[5px] w-[5px] rounded-full bg-salvia-oscuro" aria-hidden="true" /> con turnos
        </span>
        <button type="button" onClick={onVolverAHoy} className="font-medium text-salvia-oscuro hover:underline">
          Volver a hoy
        </button>
      </div>

      {cargando && <p className="mt-2 text-center text-xs text-grafito/50">Buscando disponibilidad del mes…</p>}
    </div>
  );
}
