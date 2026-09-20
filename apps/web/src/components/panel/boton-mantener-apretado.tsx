"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

// MANTENER_APRETADO_MS — pedido textual del cliente: "hay que mantener
// apretado el botón para mostrar que no asistió o si... viendo como se
// llena para que no sea una reacción espontánea".
//
// Bajado de 10 a 5 segundos el 2026-09-19, a pedido: con los botones de
// asistencia ahora también en la tarjeta de "Turnos de hoy" —donde el
// profesional marca varios seguidos durante el día— diez segundos por
// turno se volvían una espera real, y la protección que dan es la misma:
// lo que se está evitando es un toque accidental, no una decisión
// deliberada. Los dos lugares usan esta constante: si vuelven a
// separarse, un botón pediría el doble que el otro para hacer lo mismo.
export const MANTENER_APRETADO_MS = 5_000;

const INTERVALO_PROGRESO_MS = 50;

// BotonMantenerApretado — extraído de asistencia-cartel-global.tsx el
// 2026-09-19, cuando la tarjeta de "Turnos de hoy" pasó a ofrecer la
// misma acción. Es el mismo control, no una copia parecida: marcar
// asistencia es irreversible, y dos implementaciones del gesto que la
// confirma terminarían divergiendo justo en el detalle que importa.
//
// `setInterval` con `Date.now()` en vez de `requestAnimationFrame` a
// propósito: el resultado visual es prácticamente igual (actualiza cada
// 50 ms) y así el control es determinista bajo fake timers en los tests,
// sin depender de que jsdom simule el reloj de animación del navegador.
export function BotonMantenerApretado({
  etiqueta,
  claseColor,
  disabled,
  onConfirmar,
  className = "",
  repetible = false,
}: {
  etiqueta: string;
  claseColor: string;
  disabled: boolean;
  onConfirmar: () => void;
  /** Tamaño/tipografía del botón — el cartel lo quiere grande, la fila de
   *  la tarjeta de hoy lo quiere chico. El comportamiento no cambia. */
  className?: string;
  /** Deja volver a confirmar después de la primera vez.
   *
   *  El default es `false` y no es un detalle: en el cartel del final del
   *  turno la marca es IRREVERSIBLE, así que el botón tiene que dispararse
   *  una sola vez por montaje —si no, un segundo gesto manda un pedido que
   *  el backend va a rechazar y el profesional ve un error por algo que
   *  hizo bien—.
   *
   *  En la tarjeta de "Turnos de hoy" es al revés: lo anotado es un
   *  borrador y cambiar de opinión es el caso de uso (2026-09-19, bug
   *  reportado: "no puedo poner asistió una vez que pongo no asistió...
   *  debe poder hacerse de los 2 lados"). Ahí va `repetible`. */
  repetible?: boolean;
}) {
  const [progreso, setProgreso] = useState(0);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inicioRef = useRef<number | null>(null);
  const confirmadoRef = useRef(false);

  function detenerProgreso() {
    if (intervaloRef.current !== null) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    inicioRef.current = null;
    setProgreso(0);
  }

  function iniciarProgreso() {
    if (disabled || confirmadoRef.current || intervaloRef.current !== null) return;
    inicioRef.current = Date.now();
    intervaloRef.current = setInterval(() => {
      const transcurrido = Date.now() - (inicioRef.current ?? Date.now());
      const p = Math.min(transcurrido / MANTENER_APRETADO_MS, 1);
      setProgreso(p);
      if (p >= 1) {
        if (intervaloRef.current !== null) {
          clearInterval(intervaloRef.current);
          intervaloRef.current = null;
        }
        if (!confirmadoRef.current) {
          confirmadoRef.current = repetible ? false : true;
          onConfirmar();
        }
      }
    }, INTERVALO_PROGRESO_MS);
  }

  useEffect(
    () => () => {
      if (intervaloRef.current !== null) clearInterval(intervaloRef.current);
    },
    [],
  );

  // Bug real reportado por el cliente, 2026-09-05: "toco 10 seg pero no
  // se completa" — sin capturar el puntero, `onPointerLeave` cancelaba
  // la espera apenas el cursor se salía unos píxeles del botón durante
  // la espera (temblor de mano normal al sostener el mouse quieto tanto
  // tiempo), reiniciando el progreso a 0 en silencio — nada en pantalla
  // explicaba por qué "nunca se completaba". `setPointerCapture` en el
  // `pointerdown` es el patrón correcto para "mantener apretado": una
  // vez capturado, el botón sigue recibiendo los eventos de ESE puntero
  // pase lo que pase con el cursor hasta que se suelta de verdad — por
  // eso ya no hace falta (ni conviene) escuchar `onPointerLeave`, solo
  // `onPointerUp`/`onPointerCancel` son señales reales de "se soltó".
  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    iniciarProgreso();
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    detenerProgreso();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) iniciarProgreso();
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") detenerProgreso();
      }}
      className={`relative touch-none overflow-hidden rounded-field border-[0.5px] border-arena font-semibold text-marfil select-none disabled:opacity-60 ${claseColor} ${className}`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-marfil/30" style={{ width: `${progreso * 100}%` }} />
      <span className="relative">{etiqueta}</span>
      <span className="sr-only" role="status">
        {progreso > 0 && progreso < 1 ? `${Math.round(progreso * 100)}% mantenido` : ""}
      </span>
    </button>
  );
}
