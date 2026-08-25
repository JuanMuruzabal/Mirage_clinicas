"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

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
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
