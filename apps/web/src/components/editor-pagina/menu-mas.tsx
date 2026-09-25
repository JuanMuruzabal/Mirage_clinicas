"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface AccionDelMenu {
  id: string;
  etiqueta: ReactNode;
  /** Un link (se abre en otra pestaña) en vez de un botón. */
  href?: string;
  onElegir?: () => void;
  disabled?: boolean;
  peligro?: boolean;
}

interface MenuMasProps {
  acciones: AccionDelMenu[];
  className?: string;
}

const CLASE_ITEM = "flex min-h-11 w-full items-center rounded-field px-3 text-left text-sm font-medium hover:bg-hueso disabled:cursor-not-allowed disabled:opacity-50";

// MenuMas (PP-5, H15) — en un celular la barra del editor tenía ~7 acciones
// partidas en filas; debajo de `lg` quedan a la vista Guardar y Publicar y
// el resto va acá. Es un DESPLEGABLE (botón con aria-expanded que muestra una
// lista de botones), no un `role="menu"`: un menú de ARIA promete flechas y
// type-ahead, y para cinco acciones un Tab común alcanza y no sorprende.
// Escape y tocar afuera lo cierran; elegir una acción también.
export function MenuMas({ acciones, className }: MenuMasProps) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function afuera(e: PointerEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    function teclado(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setAbierto(false);
      boton.current?.focus();
    }
    document.addEventListener("pointerdown", afuera);
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("pointerdown", afuera);
      document.removeEventListener("keydown", teclado);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className={`relative ${className ?? ""}`}>
      <button
        ref={boton}
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto((a) => !a)}
        className="min-h-11 rounded-full border-[0.5px] border-arena bg-marfil px-4 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
      >
        Más
      </button>
      {abierto && (
        <ul id={id} className="absolute right-0 top-full z-30 mt-2 flex w-60 flex-col gap-1 rounded-card border-[0.5px] border-arena bg-marfil p-2 shadow-soft">
          {acciones.map((a) => (
            <li key={a.id}>
              {a.href ? (
                <a href={a.href} target="_blank" rel="noopener noreferrer" onClick={() => setAbierto(false)} className={`${CLASE_ITEM} text-grafito`}>
                  {a.etiqueta}
                </a>
              ) : (
                <button
                  type="button"
                  disabled={a.disabled}
                  onClick={() => {
                    setAbierto(false);
                    // El foco vuelve a "Más" ANTES de la acción: si abre un
                    // Dialogo, ese es el elemento al que el diálogo devuelve
                    // el foco al cerrarse (el ítem ya no existe).
                    boton.current?.focus();
                    a.onElegir?.();
                  }}
                  className={`${CLASE_ITEM} ${a.peligro ? "text-terracota-oscuro" : "text-grafito"}`}
                >
                  {a.etiqueta}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
