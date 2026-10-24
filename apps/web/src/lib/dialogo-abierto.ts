"use client";

import { useEffect, useRef, type RefObject } from "react";

// Lo que hace todo diálogo del panel mientras está abierto (correcciones
// generales, ítems 3 y 4): Escape lo cierra con lo mismo que su cruz, y la
// página de atrás no scrollea.

// Una PILA y no un listener por diálogo: con un diálogo abierto encima de
// otro (una regla nueva sobre la configuración del calendario, cancelar un
// turno sobre su detalle), Escape tiene que cerrar solo el de arriba. Con un
// listener cada uno, cerraba los dos de un saque.
const pila: RefObject<() => void>[] = [];

// En `window` y no en `document`: un control de adentro que usa Escape para
// sí (el menú del selector de profesional, la pieza agrandada del
// odontograma) lo marca con `preventDefault()` desde su propio listener de
// `document` o desde React, y los dos corren antes que uno de `window`. En
// `document`, el orden dependía de quién se había registrado primero, y el
// diálogo, abierto antes que su menú, se cerraba primero.
function alTeclear(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const arriba = pila[pila.length - 1];
  if (!arriba) return;
  e.preventDefault();
  arriba.current();
}

/** Si este diálogo es el de más arriba (para atrapar el Tab solo ahí). */
export function esElDeArriba(entrada: RefObject<() => void>) {
  return pila[pila.length - 1] === entrada;
}

// El scroll de la página se bloquea en <html>, no en <body> (el mismo
// arreglo que la bandeja de notificaciones, 2026-10-10): <html> tiene su
// propio `overflow-y: scroll` (TR-034), así que un `overflow: hidden` en
// <body> no frenaba a la ventana y convertía al body en un contenedor de
// scroll, y el sidebar `sticky` se iba hacia arriba. `scrollbar-gutter:
// stable` conserva el lugar de la barra: el ancho no salta al abrir. Con un
// contador, para que el diálogo de abajo no lo libere al cerrarse el de
// arriba. En el celular quien scrollea es el `<main>` del panel, y la capa
// del diálogo (en un portal, fuera de él) no le pasa el gesto.
let bloqueos = 0;
let anterior = { overflowY: "", gutter: "" };

export function bloquearScrollDeLaPagina() {
  const html = document.documentElement;
  if (bloqueos === 0) {
    anterior = { overflowY: html.style.overflowY, gutter: html.style.scrollbarGutter };
    html.style.scrollbarGutter = "stable";
    html.style.overflowY = "hidden";
  }
  bloqueos += 1;
  return () => {
    bloqueos -= 1;
    if (bloqueos === 0) {
      html.style.overflowY = anterior.overflowY;
      html.style.scrollbarGutter = anterior.gutter;
    }
  };
}

/**
 * Para un diálogo abierto: Escape lo cierra (con `cerrar`, lo mismo que hace
 * su cruz) y la página de atrás no scrollea. Devuelve la entrada de la pila,
 * para preguntar con `esElDeArriba` si es el de arriba.
 */
export function useDialogoAbierto(cerrar: () => void, activo = true) {
  const entrada = useRef(cerrar);
  useEffect(() => {
    entrada.current = cerrar;
  });
  useEffect(() => {
    if (!activo) return;
    pila.push(entrada);
    if (pila.length === 1) window.addEventListener("keydown", alTeclear);
    const liberar = bloquearScrollDeLaPagina();
    return () => {
      liberar();
      const i = pila.lastIndexOf(entrada);
      if (i >= 0) pila.splice(i, 1);
      if (pila.length === 0) window.removeEventListener("keydown", alTeclear);
    };
  }, [activo]);
  return entrada;
}
