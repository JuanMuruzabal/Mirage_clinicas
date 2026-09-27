"use client";

import { useEffect, type RefObject } from "react";

// useAltoDeFilas — en el celular, la caja con scroll de una tabla mide lo
// justo para mostrar la cabecera y sus primeras N filas enteras, más una
// franja de la siguiente para que se note que hay más (2026-09-27, pedido
// del cliente: "las tablas en móvil muestran hasta tres, y la tercera
// entrecortada; quisiera cuatro antes de tener que hacer scroll").
//
// Medido y no un alto fijo: una fila de Turnos mide casi el doble que una
// de Pacientes, y en un celular más angosto las dos crecen porque los
// nombres pasan a dos renglones. Un número en rem acertaba en un teléfono
// y cortaba la tercera fila en otro.
//
// Escribe el resultado en `--alto-mobile` sobre la caja y la clase
// `max-md:max-h-[var(--alto-mobile,21rem)]` lo usa; mientras tanto (el HTML
// del servidor, antes de medir) vale el alto de siempre. Sin estado de
// React: es una medida de presentación y no hace falta re-renderizar.

const MOBILE = "(max-width: 47.999rem)";
const FRANJA_PX = 28;

export function useAltoDeFilas(caja: RefObject<HTMLElement | null>, filas = 4) {
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const consulta = window.matchMedia?.(MOBILE);

    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => medir());
    let tablaObservada: Element | null = null;

    function medir() {
      if (!el) return;
      const tabla = el.querySelector("table");
      // La tabla puede aparecer después (del "no hay pacientes" a la
      // primera fila) o cambiar: se observa la que haya ahora.
      if (observador && tabla && tabla !== tablaObservada) {
        if (tablaObservada) observador.unobserve(tablaObservada);
        observador.observe(tabla);
        tablaObservada = tabla;
      }
      if (!consulta?.matches || !tabla) {
        el.style.removeProperty("--alto-mobile");
        return;
      }
      const cabecera = tabla.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      const todas = Array.from(tabla.querySelectorAll(":scope > tbody > tr"));
      const visibles = todas.slice(0, filas).reduce((suma, fila) => suma + fila.getBoundingClientRect().height, 0);
      const siguiente = todas[filas]?.getBoundingClientRect().height ?? 0;
      // Con pocas filas no hace falta tope: la caja mide lo que tiene. `none`
      // y no quitar la variable: sin ella vuelve el alto de siempre, que no
      // alcanza para cuatro filas de Turnos.
      if (todas.length <= filas || visibles === 0) {
        el.style.setProperty("--alto-mobile", "none");
        return;
      }
      const alto = Math.ceil(cabecera + visibles + Math.min(FRANJA_PX, siguiente / 2));
      el.style.setProperty("--alto-mobile", `${alto}px`);
    }

    // Las filas cambian de alto al cargar más, al filtrar o al rotar el
    // teléfono: la caja y la tabla avisan cuando cambian de tamaño.
    observador?.observe(el);
    medir();
    consulta?.addEventListener?.("change", medir);
    return () => {
      observador?.disconnect();
      consulta?.removeEventListener?.("change", medir);
    };
  }, [caja, filas]);
}
