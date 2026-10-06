"use client";

import { useId, useState } from "react";
import { errorDeDibujo, type CampoDibujo as DefinicionDeDibujo, type ValorDibujo } from "@dental-mirage/documentos-clinicos";
import { Dialogo } from "@/components/dialogo";
import { LienzoDeDibujo, lienzoPara } from "./lienzo-de-dibujo";
import { caminoDelTrazo } from "./trazo-de-firma";

// Un campo dibujo en el formulario (Fase 5.6b): un resumen —la miniatura de
// lo dibujado o "Sin dibujar"— y el botón que abre el lienzo en una pantalla
// emergente, como el odontograma. Igual que él, se guarda solo: cada trazo
// terminado, Deshacer y Borrar todo actualizan el valor del campo, y cerrar
// la pantalla (Listo, Escape, Cerrar o el fondo) no pierde nada.

/** El valor guardado, si es un dibujo bien formado con trazos. */
function dibujoGuardado(valor: unknown): ValorDibujo | null {
  if (errorDeDibujo(valor) !== null) return null;
  const dibujo = valor as ValorDibujo;
  return dibujo.trazos.length > 0 ? dibujo : null;
}

function Miniatura({ dibujo }: { dibujo: ValorDibujo }) {
  return (
    <svg
      viewBox={`0 0 ${dibujo.ancho} ${dibujo.alto}`}
      className="h-20 max-w-full rounded-field border border-linea bg-hueso text-grafito"
      style={{ aspectRatio: `${dibujo.ancho} / ${dibujo.alto}` }}
      aria-hidden="true"
    >
      {dibujo.trazos.map((puntos, i) => (
        <path
          key={i}
          d={caminoDelTrazo(puntos)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function CampoDibujo({
  campo,
  valor,
  onCambio,
  proporcion,
  id,
  etiquetaId,
  describedBy,
  abierto,
  onAbierto,
}: {
  campo: DefinicionDeDibujo;
  valor: unknown;
  /** `undefined` borra el valor: un dibujo sin trazos no se guarda. */
  onCambio: (valor: ValorDibujo | undefined) => void;
  /** Ancho / alto del recuadro del dibujo en la hoja: el lienzo lo copia. */
  proporcion: number;
  /** El id del botón que abre la pantalla emergente: el editor lleva ahí el
   *  foco como a cualquier otro campo. */
  id: string;
  etiquetaId: string;
  describedBy?: string;
  /** La pantalla emergente, si la maneja el editor (que la abre al tocar el
   *  dibujo en la hoja o ante un error al terminar). */
  abierto?: boolean;
  onAbierto?: (abierto: boolean) => void;
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const estaAbierto = abierto ?? abiertoPropio;
  const cambiarAbierto = onAbierto ?? setAbiertoPropio;
  const idResumen = useId();
  const guardado = dibujoGuardado(valor);
  const cerrar = () => cambiarAbierto(false);

  return (
    <div role="group" aria-labelledby={etiquetaId} aria-describedby={describedBy} className="flex min-w-0 flex-col items-start gap-2">
      <div id={idResumen}>
        {guardado ? (
          <>
            <Miniatura dibujo={guardado} />
            <span className="sr-only">Dibujado</span>
          </>
        ) : (
          <p className="text-sm text-grafito/75">Sin dibujar</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        aria-describedby={idResumen}
        onClick={() => cambiarAbierto(true)}
        className="min-h-11 rounded-full border border-salvia-oscuro bg-marfil px-4 text-sm font-medium text-salvia-oscuro hover:bg-salvia-claro"
      >
        Abrir {campo.etiqueta.toLowerCase()}
      </button>
      {estaAbierto && (
        <Dialogo
          titulo={campo.etiqueta}
          descripcion="Dibujá a mano alzada. Se guarda solo, como el resto del documento."
          ancho="completo"
          superficie="marfil"
          onCerrar={cerrar}
          // Igual que el odontograma: lo dibujado ya está guardado, así que
          // Listo, Escape, Cerrar y el fondo solo cierran.
          pie={
            <button
              type="button"
              onClick={cerrar}
              className="min-h-11 rounded-full bg-salvia-oscuro px-6 text-sm font-semibold text-marfil hover:brightness-95"
            >
              Listo
            </button>
          }
        >
          <div className="p-4 sm:p-6 [@media(max-height:30rem)]:py-3">
            <LienzoDeDibujo
              inicial={guardado ?? { ...lienzoPara(proporcion), trazos: [] }}
              onCambio={(dibujo) => onCambio(dibujo.trazos.length > 0 ? dibujo : undefined)}
              etiqueta={campo.etiqueta}
            />
          </div>
        </Dialogo>
      )}
    </div>
  );
}
