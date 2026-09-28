"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { TrazoDeFirma } from "@dental-mirage/shared-types";
import { caminoDelTrazo } from "./trazo-de-firma";

/** Lo mínimo para que una firma cuente: la API rechaza menos de 10 puntos
 *  (internal/documentos.NormalizarTrazo). */
export const PUNTOS_MINIMOS = 10;

const ALTO = 180;

type Punto = [number, number, number];

function redondear(n: number, decimales: number): number {
  const escala = 10 ** decimales;
  return Math.round(n * escala) / escala;
}

// LienzoDeFirma — donde se firma con el dedo o el mouse (Fase 5.1, TR-184).
//
// Guarda la firma como VECTORES con sus tiempos, no como una foto: cada
// punto es [x, y, milisegundos desde el primer toque]. Se dibuja con SVG
// (no con <canvas>) para que lo que se ve mientras se firma sea
// exactamente lo que después se muestra y se imprime.
//
// `touch-action: none` es lo que evita que el dedo, al firmar, mueva la
// página en vez de dibujar.
export function LienzoDeFirma({
  onCambio,
  etiqueta,
}: {
  /** La firma cada vez que se levanta el dedo; null si está vacía o es
   *  demasiado corta para contar. */
  onCambio: (trazo: TrazoDeFirma | null) => void;
  etiqueta: string;
}) {
  const inicio = useRef<number | null>(null);
  const dibujando = useRef(false);
  const medida = useRef({ ancho: 0, alto: ALTO });
  // Los trazos viven en una referencia (lo que se avisa) y en el estado
  // (lo que se dibuja): avisar desde adentro de un setState es un efecto
  // secundario que React puede correr dos veces.
  const trazosRef = useRef<Punto[][]>([]);
  const [trazos, setTrazos] = useState<Punto[][]>([]);

  function cambiar(nuevos: Punto[][]) {
    trazosRef.current = nuevos;
    setTrazos(nuevos);
  }

  function punto(e: PointerEvent<HTMLDivElement>): Punto {
    const rect = e.currentTarget.getBoundingClientRect();
    if (inicio.current === null) inicio.current = e.timeStamp;
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    return [redondear(x, 1), redondear(y, 1), Math.max(0, Math.round(e.timeStamp - inicio.current))];
  }

  function empezar(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    // Hacia arriba: ningún punto (que llega hasta el borde) puede quedar
    // "afuera" del lienzo que se declara.
    medida.current = { ancho: Math.ceil(rect.width), alto: Math.ceil(rect.height) || ALTO };
    dibujando.current = true;
    cambiar([...trazosRef.current, [punto(e)]]);
  }

  function mover(e: PointerEvent<HTMLDivElement>) {
    if (!dibujando.current) return;
    const p = punto(e);
    const actuales = trazosRef.current;
    const ultimo = actuales[actuales.length - 1] ?? [];
    const anterior = ultimo[ultimo.length - 1];
    // Un punto encima del anterior no suma nada.
    if (anterior && anterior[0] === p[0] && anterior[1] === p[1]) return;
    cambiar([...actuales.slice(0, -1), [...ultimo, p]]);
  }

  function terminar() {
    if (!dibujando.current) return;
    dibujando.current = false;
    const actuales = trazosRef.current;
    const total = actuales.reduce((n, t) => n + t.length, 0);
    onCambio(total >= PUNTOS_MINIMOS ? { ancho: medida.current.ancho, alto: medida.current.alto, trazos: actuales } : null);
  }

  function borrar() {
    inicio.current = null;
    cambiar([]);
    onCambio(null);
  }

  const vacio = trazos.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="application"
        aria-label={etiqueta}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
        style={{ height: ALTO, touchAction: "none" }}
        className="relative w-full cursor-crosshair select-none rounded-field border border-linea bg-marfil"
      >
        {/* La línea de la firma y el aviso, debajo del trazo. */}
        <span aria-hidden="true" className="pointer-events-none absolute right-6 bottom-10 left-6 border-b border-dashed border-grafito/30" />
        {vacio && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-grafito/75">
            Firmá acá con el dedo o el mouse
          </span>
        )}
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-grafito" aria-hidden="true">
          {trazos.map((puntos, i) => (
            <path key={i} d={caminoDelTrazo(puntos)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={borrar}
          disabled={vacio}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-salvia-oscuro hover:bg-arena disabled:opacity-40"
        >
          Borrar y volver a firmar
        </button>
      </div>
    </div>
  );
}
