"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

interface PestanasProps<T extends string> {
  etiqueta: string;
  pestanas: readonly (readonly [T, string])[];
  activa: T;
  onCambio: (id: T) => void;
  /** El contenido de la pestaña activa: se dibuja adentro de su `tabpanel`. */
  children: ReactNode;
}

// Pestanas (PP-4, H12) — el patrón de pestañas de WAI-ARIA con activación
// automática: cada `tab` apunta a su `tabpanel` (`aria-controls`) y el panel
// dice qué pestaña lo nombra (`aria-labelledby`); la lista es una sola parada
// de Tab y las flechas (y Home/End) cambian de pestaña. Solo se dibuja el
// panel activo — los otros no existen en el DOM, así que `aria-controls`
// apunta nada más desde la pestaña activa.
export function Pestanas<T extends string>({ etiqueta, pestanas, activa, onCambio, children }: PestanasProps<T>) {
  const base = useId();
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const idPestana = (id: T) => `${base}-pestana-${id}`;
  const idPanel = (id: T) => `${base}-panel-${id}`;

  function alTeclear(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const ultimo = pestanas.length - 1;
    let destino: number;
    if (e.key === "ArrowRight") destino = indice === ultimo ? 0 : indice + 1;
    else if (e.key === "ArrowLeft") destino = indice === 0 ? ultimo : indice - 1;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = ultimo;
    else return;
    e.preventDefault();
    botones.current[destino]?.focus();
    onCambio(pestanas[destino][0]);
  }

  return (
    <>
      <div role="tablist" aria-label={etiqueta} className="flex gap-1 rounded-full bg-hueso p-1">
        {pestanas.map(([id, nombre], i) => {
          const esLaActiva = id === activa;
          return (
            <button
              key={id}
              ref={(el) => {
                botones.current[i] = el;
              }}
              id={idPestana(id)}
              type="button"
              role="tab"
              aria-selected={esLaActiva}
              aria-controls={esLaActiva ? idPanel(id) : undefined}
              tabIndex={esLaActiva ? 0 : -1}
              onClick={() => onCambio(id)}
              onKeyDown={(e) => alTeclear(e, i)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium pointer-coarse:min-h-11 ${
                esLaActiva ? "bg-marfil text-grafito shadow-soft" : "text-grafito/75 hover:text-grafito"
              }`}
            >
              {nombre}
            </button>
          );
        })}
      </div>
      {/* tabIndex=0: WAI-ARIA lo pide cuando el panel no empieza con algo
          enfocable, para que Tab desde la pestaña lleve al contenido. */}
      <div role="tabpanel" id={idPanel(activa)} aria-labelledby={idPestana(activa)} tabIndex={0} className="flex flex-col gap-4 outline-none focus-visible:ring-2 focus-visible:ring-salvia">
        {children}
      </div>
    </>
  );
}
