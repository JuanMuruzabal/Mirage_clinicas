"use client";

import { useEffect, useRef, type ComponentProps } from "react";

// LA TARJETA DEL ENCABEZADO DE SECCIÓN, CON EL MOVIMIENTO DE SUS ESCENAS
// (correcciones generales, ítem 2, 2026-10-11: "acortar las animaciones de
// las escenas para optimizar"). Es el `<header>` de `EncabezadoDeSeccion`,
// y lo único que agrega es quién decide CUÁNDO se mueve cada escena.
//
// Las piezas de una escena (`escenas.tsx`) se animan solo mientras su
// viñeta tiene `.en-accion` (globals.css): una vez, lo que dura su acción
// (`data-accion-ms`). Esto pone esa clase a UNA viñeta por vez —primero la
// principal, después la otra—, con un descanso largo entre una acción y la
// siguiente, y en cada acción corre un tramo el tono de la línea (`--giro`).
// En el descanso no corre ninguna animación: es lo que baja el costo (las
// medidas, en globals.css).
//
// No mueve nada:
//   - fuera de la pantalla o con la pestaña oculta;
//   - con "reducir movimiento" (las escenas quedan en su estado base);
//   - sin JavaScript o sin IntersectionObserver: el HTML del servidor ya
//     muestra cada escena en su mejor cuadro. Nada se esconde hasta hidratar.

/** Al entrar en la pantalla, la primera acción llega enseguida. */
const PRIMERA_ESPERA_MS = 1200;
/** Entre el final de una acción y el comienzo de la siguiente. */
const DESCANSO_MS = 9000;
/** Lo que se corren algunas piezas dentro de su acción (`--d`). */
const MARGEN_MS = 600;
/** Cuánto corre el tono de la línea en cada acción. */
const GIRO_POR_ACCION_GRADOS = 40;

export function TarjetaConEscenas(props: ComponentProps<"header">) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const tarjeta = ref.current;
    if (!tarjeta) return;
    return animarEscenas(tarjeta);
  }, []);
  return <header ref={ref} {...props} />;
}

/** Lo mismo para un dibujo que no es un encabezado: las escenas de fondo de
 *  las tarjetas de /seleccionar-servicio (2026-10-19, pedido de la persona:
 *  que sus colores vayan cambiando como los de los encabezados). Sin
 *  acciones propias, solo corre el tono de la línea (`--giro`) cada tanto. */
export function EscenasAnimadas(props: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const caja = ref.current;
    if (!caja) return;
    return animarEscenas(caja);
  }, []);
  return <div ref={ref} {...props} />;
}

function animarEscenas(tarjeta: HTMLElement): (() => void) | undefined {
  if (typeof IntersectionObserver === "undefined") return undefined;
  const reducir = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  let visible = false;
  let espera: number | undefined;
  let fin: number | undefined;
  let enAccion: HTMLElement | null = null;
  let ultimoFin = -Infinity;
  let turno = 0;
  let giro = 0;

  const activa = () => visible && document.visibilityState !== "hidden" && !reducir?.matches;

  function cortarAccion() {
    window.clearTimeout(fin);
    fin = undefined;
    enAccion?.classList.remove("en-accion");
    enAccion = null;
  }

  function actuar() {
    espera = undefined;
    if (!activa()) return;
    // Las viñetas que se ven ahora: cuáles son depende del ancho de la
    // tarjeta (en lo angosto, una sola).
    const escenas = Array.from(tarjeta.querySelectorAll<HTMLElement>(".escena")).filter(
      (escena) => escena.getClientRects().length > 0,
    );
    if (escenas.length === 0) {
      ultimoFin = performance.now();
      programar();
      return;
    }
    escenas.sort(
      (a, b) => Number(b.dataset.accion === "principal") - Number(a.dataset.accion === "principal"),
    );
    const escena = escenas[turno % escenas.length];
    turno += 1;
    giro += GIRO_POR_ACCION_GRADOS;
    tarjeta.style.setProperty("--giro", `${giro}deg`);
    escena.classList.add("en-accion");
    enAccion = escena;
    fin = window.setTimeout(
      () => {
        cortarAccion();
        ultimoFin = performance.now();
        programar();
      },
      (Number(escena.dataset.accionMs) || 3000) + MARGEN_MS,
    );
  }

  function programar() {
    if (!activa() || espera !== undefined || enAccion) return;
    const faltan = Math.max(PRIMERA_ESPERA_MS, ultimoFin + DESCANSO_MS - performance.now());
    espera = window.setTimeout(actuar, faltan);
  }

  function actualizar() {
    if (activa()) {
      programar();
      return;
    }
    window.clearTimeout(espera);
    espera = undefined;
    if (reducir?.matches) cortarAccion();
  }

  const observador = new IntersectionObserver((entradas) => {
    visible = entradas.some((entrada) => entrada.isIntersecting);
    actualizar();
  });
  observador.observe(tarjeta);
  document.addEventListener("visibilitychange", actualizar);
  reducir?.addEventListener?.("change", actualizar);

  return () => {
    observador.disconnect();
    document.removeEventListener("visibilitychange", actualizar);
    reducir?.removeEventListener?.("change", actualizar);
    window.clearTimeout(espera);
    cortarAccion();
  };
}
