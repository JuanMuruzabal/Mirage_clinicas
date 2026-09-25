"use client";

import { Miniatura, type VarianteModulo } from "@dental-mirage/prisma-engine";
import { claseDeEleccion } from "./estilos";
import { GrupoDeOpciones } from "./grupo-de-opciones";

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
    <GrupoDeOpciones
      etiqueta={etiqueta}
      valor={elegida}
      onCambio={onElegir}
      opciones={variantes.map((v) => ({
        valor: v.id,
        contenido: (
          <>
            <Miniatura variante={v} />
            {v.nombre}
          </>
        ),
      }))}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      claseOpcion={(activa) => `flex flex-col gap-1.5 rounded-field border-[0.5px] p-2 text-left text-xs font-medium text-grafito transition-colors ${claseDeEleccion(activa)}`}
    />
  );
}
