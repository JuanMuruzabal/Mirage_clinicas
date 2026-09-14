"use client";

import { useEffect, useRef, useState } from "react";

export interface AccionDelMenu {
  label: string;
  onClick: () => void;
  /** Acciones que sacan a alguien o cancelan algo. */
  peligrosa?: boolean;
}

// Menú de tres puntos de una tarjeta del equipo — Fase 3.2.4, rediseño.
//
// Las acciones vivían sueltas al pie de cada tarjeta, en texto: con tres
// ("Ver permisos", "Cambiar rol", "Quitar del equipo") la tarjeta pasa a
// tener más botones que datos. Adentro de un menú, la tarjeta vuelve a
// ser lo que es —una persona— y las acciones quedan a un click.
//
// Cierra al hacer click afuera y con Escape, que es lo mínimo que se
// espera de algo que tapa contenido.
export function MenuAcciones({ nombre, acciones }: { nombre: string; acciones: AccionDelMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alClickearAfuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    function alApretarEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClickearAfuera);
    document.addEventListener("keydown", alApretarEscape);
    return () => {
      document.removeEventListener("mousedown", alClickearAfuera);
      document.removeEventListener("keydown", alApretarEscape);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative flex-shrink-0">
      <button
        type="button"
        aria-expanded={abierto}
        aria-label={`Acciones de ${nombre}`}
        onClick={() => setAbierto((a) => !a)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-grafito/40 transition-colors hover:bg-hueso hover:text-grafito"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute right-0 top-[calc(100%+0.25rem)] z-10 flex w-52 flex-col gap-0.5 rounded-card border border-linea bg-marfil p-1.5 shadow-soft">
          {acciones.map((accion) => (
            <button
              key={accion.label}
              type="button"
              onClick={() => {
                setAbierto(false);
                accion.onClick();
              }}
              className={`rounded-field px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-hueso ${
                accion.peligrosa ? "text-terracota-oscuro" : "text-grafito"
              }`}
            >
              {accion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
