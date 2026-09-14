import type { ReactNode } from "react";
import { IconCheck } from "../icons";

interface TarjetaOpcionProps {
  seleccionada: boolean;
  onClick: () => void;
  icono: ReactNode;
  titulo: string;
  descripcion: string;
}

// Tarjeta que se comporta como un radio button — Fase 3.2.3.
//
// Nació en el alta de la clínica (individual / organización) y se extrajo
// acá al sumarse la segunda elección del mismo tipo: qué hace esta
// persona en la clínica, atender o no. Son la misma pregunta de forma —
// una entre dos— y tienen que verse igual.
//
// El estado elegido se marca con el verde de la marca, fondo menta y un
// tilde; el ícono va arriba a la izquierda y el círculo de selección
// arriba a la derecha, para que se lea como un radio aunque sea una
// tarjeta (ronda de QA del 2026-09-13: el borde negro grueso anterior
// saltaba porque el negro no existe en ningún otro lado de PRISMA).
export function TarjetaOpcion({ seleccionada, onClick, icono, titulo, descripcion }: TarjetaOpcionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionada}
      className={`flex h-full flex-col gap-2 rounded-[10px] border-[0.5px] p-4 text-left transition-colors ${
        seleccionada ? "border-salvia bg-salvia-claro" : "border-arena bg-marfil hover:border-salvia"
      }`}
    >
      <span className="flex items-start justify-between">
        <span className={seleccionada ? "text-salvia-oscuro" : "text-grafito/40"}>{icono}</span>
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 items-center justify-center rounded-full border-[0.5px] ${
            seleccionada ? "border-salvia-oscuro bg-salvia-oscuro text-marfil" : "border-arena"
          }`}
        >
          {seleccionada && <IconCheck className="h-3.5 w-3.5" />}
        </span>
      </span>
      <span
        className={`font-[family-name:var(--font-display)] text-lg font-medium ${
          seleccionada ? "text-salvia-oscuro" : "text-grafito"
        }`}
      >
        {titulo}
      </span>
      <span className="text-sm text-grafito/60">{descripcion}</span>
    </button>
  );
}
