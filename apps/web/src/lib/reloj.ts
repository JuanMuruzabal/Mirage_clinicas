"use client";

import { useSyncExternalStore } from "react";

/**
 * useAhora — la hora actual, como una fuente externa que la pantalla
 * observa (2026-09-19).
 *
 * ## Para qué
 *
 * Hay estados que no salen de la base sino del reloj: un turno está "en
 * proceso" porque estamos dentro de su horario, y los botones de
 * asistencia se abren 5 minutos antes de que empiece. Eso tiene que
 * cambiar solo en la pantalla que ya está abierta, sin que nadie
 * refresque.
 *
 * ## Por qué `useSyncExternalStore` y no un `useState` + efecto
 *
 * Dos razones, y las dos son del proyecto y no teóricas:
 *
 * 1. **El lint lo prohíbe, con razón.** `setState` sincrónico adentro de
 *    un efecto dispara renders en cascada (`react-hooks/set-state-in-effect`,
 *    error real al escribir esto). La alternativa de setear solo dentro
 *    del `setInterval` dejaba la pantalla sin estado hasta el primer
 *    tick.
 * 2. **La hidratación.** El panel se renderiza también en el servidor, y
 *    ahí `Date.now()` es el reloj del contenedor. `getServerSnapshot`
 *    devuelve `null`: el HTML del servidor sale sin nada que dependa de
 *    la hora, y el valor real aparece en el primer render del cliente.
 *    Es el mecanismo que este hook tiene para esto, y evita el mismatch
 *    que el mismo repo ya se comió una vez con `toLocaleString`
 *    (ver el comentario de TIMEZONE en turno-format.ts).
 *
 * ## El valor viene redondeado, a propósito
 *
 * `getSnapshot` tiene que devolver el MISMO valor entre notificaciones o
 * React vuelve a renderizar sin parar. `Date.now()` crudo cambia cada
 * milisegundo, así que se redondea hacia abajo al múltiplo del
 * intervalo: dentro de una ventana siempre da lo mismo, sin necesidad de
 * cachear nada ni de un módulo con estado.
 *
 * El costo es que la hora puede quedar hasta un intervalo atrasada — con
 * 15 segundos, un turno que arranca recién se marca "en proceso" unos
 * segundos después. Es el error que se aceptó para no tener un reloj
 * mutable compartido entre componentes.
 *
 * @param intervaloMs cada cuánto se vuelve a mirar la hora.
 * @returns el instante en ms, o `null` mientras se renderiza en el servidor.
 */
export function useAhora(intervaloMs: number): number | null {
  return useSyncExternalStore(
    (alCambiar) => {
      const timer = setInterval(alCambiar, intervaloMs);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / intervaloMs) * intervaloMs,
    () => null,
  );
}
