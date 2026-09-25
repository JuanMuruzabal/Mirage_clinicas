"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { CLASE_ETIQUETA } from "./estilos";

export interface OpcionDeGrupo {
  valor: string;
  contenido: ReactNode;
  title?: string;
}

interface GrupoDeOpcionesProps {
  /** El nombre del grupo: se dibuja una sola vez y el radiogroup lo toma por `aria-labelledby`. */
  etiqueta: string;
  /** Para un grupo cuyo nombre ya se ve en otro lado (un encabezado, un control obvio): queda solo para el lector de pantalla. */
  etiquetaOculta?: boolean;
  opciones: OpcionDeGrupo[];
  /** La elegida; si ninguna coincide, la primera es la que recibe el Tab. */
  valor: string;
  onCambio: (valor: string) => void;
  disabled?: boolean;
  /** Layout del grupo (flex, grid…). */
  className?: string;
  claseOpcion: (elegida: boolean) => string;
}

const SIGUIENTE = new Set(["ArrowRight", "ArrowDown"]);
const ANTERIOR = new Set(["ArrowLeft", "ArrowUp"]);

// GrupoDeOpciones (PP-4, H9) — el patrón de radio de WAI-ARIA: el grupo es
// UNA parada de Tab (la opción elegida), las flechas recorren y eligen, y
// Home/End van a los extremos. Antes cada opción era un botón suelto con
// `role="radio"`: en Diseño eran ~40 Tabs, y el nombre del grupo se leía
// dos veces (`legend` + `aria-label`). Elegir con flechas cambia el borrador
// al instante, como hace un radio nativo — y como con cualquier otro cambio
// del editor, "Deshacer"/descartar siguen disponibles.
export function GrupoDeOpciones({ etiqueta, etiquetaOculta, opciones, valor, onCambio, disabled, className, claseOpcion }: GrupoDeOpcionesProps) {
  const id = useId();
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const elegida = opciones.findIndex((o) => o.valor === valor);
  const conFoco = elegida === -1 ? 0 : elegida;

  function alTeclear(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const ultimo = opciones.length - 1;
    let destino: number;
    if (SIGUIENTE.has(e.key)) destino = indice === ultimo ? 0 : indice + 1;
    else if (ANTERIOR.has(e.key)) destino = indice === 0 ? ultimo : indice - 1;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = ultimo;
    else return;
    e.preventDefault();
    botones.current[destino]?.focus();
    onCambio(opciones[destino].valor);
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={id} className={etiquetaOculta ? "sr-only" : CLASE_ETIQUETA}>
        {etiqueta}
      </span>
      <div role="radiogroup" aria-labelledby={id} aria-disabled={disabled || undefined} className={className}>
        {opciones.map((o, i) => {
          const esLaElegida = i === elegida;
          return (
            <button
              key={o.valor}
              ref={(el) => {
                botones.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={esLaElegida}
              tabIndex={i === conFoco ? 0 : -1}
              title={o.title}
              disabled={disabled}
              onClick={() => onCambio(o.valor)}
              onKeyDown={(e) => alTeclear(e, i)}
              className={claseOpcion(esLaElegida)}
            >
              {o.contenido}
            </button>
          );
        })}
      </div>
    </div>
  );
}
