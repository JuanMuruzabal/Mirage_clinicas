"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// Revelar — una parte de la home que se arma cuando entra en la pantalla.
// La animación es CSS (`.rv*` en app/home.css); esto solo decide CUÁNDO,
// con el mismo criterio que las tarjetas del panel (TR-180):
//
//   - Sin hacer nada, se arma una vez al pintar la página: el HTML del
//     servidor se ve aunque todavía no haya hidratado, y sin JavaScript.
//   - Al hidratar, lo que está FUERA de la pantalla pasa a `en-espera`
//     (taparlo no se ve: está afuera) y se arma recién cuando entra.
//   - Lo que ya estaba a la vista no se toca: repetirlo sería un parpadeo.
//
// Reemplaza en la home a `ScrollReveal` (framer-motion): ese componente
// arranca con opacidad 0 en el HTML del servidor, así que hasta hidratar
// la página se veía vacía, y sumaba 131 KB de JavaScript a la primera
// página que ve cualquiera.
export function Revelar({
  como: Etiqueta = "div",
  orden = 0,
  className = "",
  id,
  children,
}: {
  como?: "div" | "section" | "article" | "li" | "ol" | "ul";
  /** Para armar en cascada lo que se ve junto al entrar. */
  orden?: number;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const nodo = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = nodo.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const caja = el.getBoundingClientRect();
    if (caja.top < window.innerHeight && caja.bottom > 0) return;

    el.dataset.revelar = "en-espera";
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        el.dataset.revelar = "activo";
        observador.disconnect();
      },
      // Por el borde y no por porcentaje: una parte más alta que cinco
      // pantallas (la grilla de funciones en el celular) nunca llegaría a
      // tener el 20% adentro. Arranca cuando su borde de arriba pasa el 88%
      // de la pantalla.
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <Etiqueta
      // El ref genérico: los cinco elementos posibles son HTMLElement.
      ref={nodo as never}
      id={id}
      className={`revelar ${className}`}
      style={{ "--revelar-orden": orden } as CSSProperties}
    >
      {children}
    </Etiqueta>
  );
}
