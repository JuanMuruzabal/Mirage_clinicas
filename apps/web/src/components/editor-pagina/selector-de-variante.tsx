"use client";

import { Miniatura, type VarianteModulo } from "@dental-mirage/prisma-engine";
import { CLASE_ETIQUETA } from "./estilos";

interface SelectorDeVarianteProps {
  etiqueta: string;
  variantes: VarianteModulo[];
  /** La que rige hoy (la primera si la config no trae ninguna). */
  elegida: string;
  onElegir: (id: string) => void;
}

// SelectorDeVariante (PE-3) — elegir el layout de una sección con una
// miniatura esquemática de cada opción. Lo usan los módulos y la portada.
export function SelectorDeVariante({ etiqueta, variantes, elegida, onElegir }: SelectorDeVarianteProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={CLASE_ETIQUETA}>{etiqueta}</legend>
      <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {variantes.map((v) => {
          const activa = v.id === elegida;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onElegir(v.id)}
              className={`flex flex-col gap-1.5 rounded-field border-[0.5px] p-2 text-left text-xs font-medium text-grafito transition-colors ${
                activa ? "border-salvia-oscuro bg-salvia-claro" : "border-arena bg-marfil hover:border-salvia"
              }`}
            >
              <Miniatura variante={v} />
              {v.nombre}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
