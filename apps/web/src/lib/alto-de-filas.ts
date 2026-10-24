"use client";

import { useEffect, type RefObject } from "react";

// useAltoDeFilas — en el celular, el MÍNIMO de la caja con scroll de una
// tabla: lo justo para mostrar la cabecera y sus primeras N filas enteras,
// más una franja de la siguiente para que se note que hay más (2026-09-27,
// pedido del cliente: "las tablas en móvil muestran hasta tres, y la tercera
// entrecortada; quisiera cuatro antes de tener que hacer scroll"). El
// máximo, en las tablas de las pantallas del panel, es el espacio libre de
// la pantalla (useAltoLibre, más abajo).
//
// Medido y no un alto fijo: una fila de Turnos mide casi el doble que una
// de Pacientes, y en un celular más angosto las dos crecen porque los
// nombres pasan a dos renglones. Un número en rem acertaba en un teléfono
// y cortaba la tercera fila en otro.
//
// Escribe el resultado en `--alto-minimo` (con pocas filas, el alto de
// todas: nunca se corta la cuarta) y en `--alto-mobile`, que usan las cajas
// que solo tienen el tope de cuatro filas (los diálogos, "Turnos de hoy")
// con `max-md:max-h-[var(--alto-mobile,21rem)]`; mientras tanto (el HTML del
// servidor, antes de medir) vale el alto de siempre. Sin estado de React: es
// una medida de presentación y no hace falta re-renderizar.

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
      // El ancho visible de la caja, para lo que tiene que quedarse a la
      // vista mientras la tabla scrollea de costado (la fila desplegada de
      // Turnos, el rótulo de un grupo de anexos): `--ancho-caja`.
      el.style.setProperty("--ancho-caja", `${el.clientWidth}px`);
      const tabla = el.querySelector("table");
      // Y el de su primera columna, redondeado para arriba: lo desplegado de
      // una fila de documentos arranca en la segunda, debajo del nombre, y
      // mide lo que se ve de la caja desde ahí (`--ancho-primera-columna`).
      const primera = tabla?.querySelector("thead th");
      if (primera) el.style.setProperty("--ancho-primera-columna", `${Math.ceil(primera.getBoundingClientRect().width)}px`);
      // La tabla puede aparecer después (del "no hay pacientes" a la
      // primera fila) o cambiar: se observa la que haya ahora.
      if (observador && tabla && tabla !== tablaObservada) {
        if (tablaObservada) observador.unobserve(tablaObservada);
        observador.observe(tabla);
        tablaObservada = tabla;
      }
      if (!consulta?.matches || !tabla) {
        el.style.removeProperty("--alto-mobile");
        el.style.removeProperty("--alto-minimo");
        return;
      }
      const cabecera = tabla.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      const todas = Array.from(tabla.querySelectorAll(":scope > tbody > tr"));
      const visibles = todas.slice(0, filas).reduce((suma, fila) => suma + fila.getBoundingClientRect().height, 0);
      const siguiente = todas[filas]?.getBoundingClientRect().height ?? 0;
      if (visibles === 0) {
        el.style.setProperty("--alto-mobile", "none");
        el.style.removeProperty("--alto-minimo");
        return;
      }
      // El marco: los bordes de la caja y, ahora que la tabla del celular
      // scrollea de costado, la barra horizontal, que ocupa alto adentro de
      // la caja y si no se descontara le comería la franja a la quinta fila.
      const marco = Math.max(0, el.offsetHeight - el.clientHeight);
      const alto = Math.ceil(cabecera + visibles + Math.min(FRANJA_PX, siguiente / 2) + marco);
      el.style.setProperty("--alto-minimo", `${alto}px`);
      // Con pocas filas no hace falta tope: la caja mide lo que tiene. `none`
      // y no quitar la variable: sin ella vuelve el alto de siempre, que no
      // alcanza para cuatro filas de Turnos.
      el.style.setProperty("--alto-mobile", todas.length <= filas ? "none" : `${alto}px`);
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

// useAltoLibre — el MÁXIMO de la caja de una tabla de las pantallas del
// panel (Turnos, Pacientes, Documentos, la ficha, Seguridad): crece hasta el
// espacio libre de la pantalla, en el celular y en la computadora (pedido de
// la persona, 2026-10-19: "en el celular queda mucho espacio desaprovechado
// y las tablas se limitan antes de cubrirlo"). El mínimo sigue siendo el de
// antes: cuatro filas en el celular (`--alto-minimo`, de useAltoDeFilas) y
// 20 rem en la computadora.
//
// Mide dónde arranca la caja con la página sin scrollear (`--arriba-caja`:
// el header, el encabezado, el buscador, las pestañas) y cuánto contenido
// la sigue ("Cargar más", el relleno de la página: `--abajo-caja`), y la
// clase `.caja-alto-libre` (globals.css) resta las dos cosas del alto
// visible en `svh`: no cambia al abrirse el teclado, y con `dvh` la tabla
// saltaría mientras se escribe en el buscador.
//
// Una caja que arranca debajo de la primera pantalla, o que tiene otra
// debajo (Seguridad, /panel/documentos, la ficha), mide como mucho una
// pantalla, así al scrollear hasta ella entra entera. Llenar lo que queda
// no sirve con varias: el máximo de cada una dependería del alto de las
// otras, y las medidas se pisarían entre sí sin quedarse quietas.
//
// No hace nada fuera de `<main>` (los diálogos tienen su propio alto).

export const CLASE_ALTO_LIBRE = "caja-alto-libre";
const UNA_PANTALLA = "calc(var(--header-height) + 1rem)";

export function useAltoLibre(caja: RefObject<HTMLElement | null>, activo: boolean) {
  useEffect(() => {
    const el = caja.current;
    const main = el?.closest("main");
    if (!activo || !el || !main || typeof ResizeObserver === "undefined") return;
    const observados = new Set<Element>();
    const observador = new ResizeObserver(() => medir());
    // Un aviso que aparece arriba de la página (el de conflictos) es un
    // hijo nuevo de `<main>`: no cambia el tamaño de nada que ya se observe.
    const hijos = new MutationObserver(() => medir());

    function medir() {
      if (!el || !main) return;
      // Lo de arriba y lo de abajo de la caja cambian el alto de algún hijo
      // de `<main>` (la página que la contiene, el aviso): se observan todos.
      for (const hijo of Array.from(main.children)) {
        if (observados.has(hijo)) continue;
        observados.add(hijo);
        observador.observe(hijo);
      }
      const { arriba, abajo } = medidasVerticales(el, main);
      el.style.setProperty("--arriba-caja", arriba);
      el.style.setProperty("--abajo-caja", abajo);
    }

    medir();
    hijos.observe(main, { childList: true });
    // Rotar el teléfono o achicar la ventana cambia el alto visible.
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      hijos.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [caja, activo]);
}

function medidasVerticales(caja: HTMLElement, main: HTMLElement) {
  // Con la página sin scrollear: en el celular scrollea `<main>`, en la
  // computadora la ventana; el otro de los dos vale 0.
  const arriba = caja.getBoundingClientRect().top + main.scrollTop + window.scrollY;
  if (arriba >= window.innerHeight || hayOtraCajaDebajo(caja, main)) return { arriba: UNA_PANTALLA, abajo: "0px" };
  return { arriba: `${Math.ceil(arriba)}px`, abajo: `${Math.ceil(contenidoDebajo(caja, main))}px` };
}

function hayOtraCajaDebajo(caja: HTMLElement, main: HTMLElement) {
  return Array.from(main.querySelectorAll(`.${CLASE_ALTO_LIBRE}`)).some(
    (otra) =>
      otra !== caja &&
      otra.getClientRects().length > 0 &&
      Boolean(caja.compareDocumentPosition(otra) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
}

// Lo que sigue a la caja hasta el final del contenido de `<main>`, subiendo
// por sus contenedores: en cada uno, del borde de abajo del que la contiene
// al final de su último hijo, más el relleno y el borde. Hasta el último
// hijo y no hasta el borde del contenedor: uno estirado (`flex-1`,
// `min-h-full`) contaría como "debajo" el hueco que deja la caja al
// achicarse, y se achicaría un poco más en cada medida.
function contenidoDebajo(caja: HTMLElement, main: HTMLElement) {
  let debajo = 0;
  for (let nodo: HTMLElement = caja; nodo !== main && nodo.parentElement; nodo = nodo.parentElement) {
    const padre = nodo.parentElement;
    const estilo = getComputedStyle(padre);
    debajo += finDeLosHijos(padre) - nodo.getBoundingClientRect().bottom;
    debajo += parseFloat(estilo.paddingBottom) + parseFloat(estilo.borderBottomWidth);
  }
  return Math.max(0, debajo);
}

function finDeLosHijos(padre: HTMLElement) {
  let fin = -Infinity;
  for (const hijo of Array.from(padre.children)) {
    if (hijo.getClientRects().length === 0) continue;
    const estilo = getComputedStyle(hijo);
    if (estilo.position === "absolute" || estilo.position === "fixed") continue;
    fin = Math.max(fin, hijo.getBoundingClientRect().bottom + parseFloat(estilo.marginBottom));
  }
  return fin;
}
