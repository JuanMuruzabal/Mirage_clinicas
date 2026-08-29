"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useCalendarRotation } from "@/lib/calendar-rotation-context";

/**
 * Portal directo a `document.body` (rama fix/mobile, séptima corrección
 * 2026-08-24 — ver TR-030 en docs/tradeoffs.md, pedido explícito del
 * cliente: "Montalos con un portal al body... No deben heredar el ancho
 * del contenedor de contenido").
 *
 * Causa real de "el modal muestra 'gregar turno' en vez de 'Agregar
 * turno'": cada modal ya era `position: fixed` (ancla sus offsets al
 * viewport), pero seguía siendo un DESCENDIENTE del árbol de `<main>` en
 * el DOM — y un ancestro con `overflow` distinto de `visible` (el propio
 * `<main>`, `overflow-auto` en mobile desde TR-026) RECORTA visualmente a
 * sus descendientes aunque sean `fixed`: `position: fixed` solo cambia
 * respecto a qué se calculan los offsets, no si un ancestro con overflow
 * lo recorta al pintar. El modal, centrado sobre el viewport COMPLETO,
 * tenía su borde izquierdo cayendo en la franja que `<main>` no incluye
 * (la que ocupa el sidebar) — esa franja quedaba invisible, y por eso se
 * comían las primeras letras del texto alineado a la izquierda adentro.
 *
 * Un portal saca el nodo del DOM real de adentro de `<main>` por
 * completo — pasa a ser hijo directo de `<body>`, sin ningún ancestro
 * con overflow no-visible entre el modal y el documento, así que ya no
 * hay nada que lo recorte. Solo se usa client-side (todos los modales
 * que lo envuelven ya son "use client" y solo se montan en respuesta a
 * una interacción, nunca durante el render inicial del servidor, así que
 * no hace falta la danza de `useEffect`+`mounted` para evitar un
 * mismatch de hidratación — `document` ya existe siempre que esto corre).
 *
 * `useCalendarRotation()` (F2.2, 2026-08-29): en "modo horizontal" del
 * calendario, cualquier modal que se abra tiene que rotarse igual que el
 * calendario de atrás — pedido explícito del cliente ("los botones,
 * pantallas dentro de calendario también se deben adaptar a la
 * rotación"). Como este portal ya saca el modal a `document.body`
 * (afuera del árbol de CalendarView), la única forma de que se entere de
 * la rotación es este contexto, no herencia de DOM. El truco es el mismo
 * que usa CalendarView para rotarse a sí mismo: envolver en un
 * contenedor con `100vh`×`100vw` (ancho/alto ya intercambiados) y recién
 * ahí rotar — y como CUALQUIER elemento con `transform` pasa a ser el
 * "containing block" de sus descendientes `position: fixed` (regla real
 * de CSS, no un detalle de este proyecto), el modal de adentro —que ya
 * es `fixed inset-0` por su cuenta, sin saber nada de esto— termina
 * ocupando exactamente esta caja rotada en vez del viewport real, sin
 * tocar un solo componente de modal existente.
 *
 * Dos `<div>` anidados, no uno solo (bug reportado 2026-08-29: "los
 * botones desde el modo horizontal... los toco y no me muestran nada")
 * — WebKit/iOS tiene un bug documentado con `position: fixed` +
 * `transform` en el MISMO elemento: se ve bien, pero el toque no se
 * registra donde corresponde. El de afuera es `fixed` (fija contra el
 * viewport real) y nunca lleva transform; el de adentro lleva el
 * transform pero es `absolute` (relativo al de afuera), nunca `fixed`.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const rotado = useCalendarRotation();

  const contenido = rotado ? (
    <div className="fixed inset-0">
      <div
        className="absolute left-0 top-0 transition-transform duration-300 ease-in-out"
        style={{
          width: "100vh",
          height: "100vw",
          transformOrigin: "top left",
          transform: "rotate(90deg) translateY(-100%)",
        }}
      >
        {children}
      </div>
    </div>
  ) : (
    children
  );

  return createPortal(contenido, document.body);
}
