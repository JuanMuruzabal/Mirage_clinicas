"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// Despliegue — la tarjeta de General que se arma cuando entra en la
// pantalla (2026-09-26, pedido del cliente). La animación en sí es CSS
// (`.despliegue*` en globals.css); esto solo decide CUÁNDO:
//
//   - Sin hacer nada, la tarjeta se despliega una vez al pintar la
//     página: el HTML del servidor se ve aunque todavía no haya hidratado.
//   - Al hidratar, la que está FUERA de la pantalla pasa a `en-espera`
//     (taparla no se ve, está afuera) y se despliega recién cuando entra.
//   - La que ya estaba a la vista no se toca: su despliegue de carga ya
//     se está viendo, y repetirlo sería un parpadeo.
//
// El estado va directo al atributo del nodo y no en un `useState`: es
// presentación pura, y un render de más por tarjeta no aporta nada.
export function Despliegue({
  forma = "abajo",
  orden = 0,
  className = "",
  children,
}: {
  /** Hacia dónde se abre el cuerpo. "derecha" es solo desde tablet: en el
   *  celular las dos partes de "Turnos de hoy" se apilan. */
  forma?: "abajo" | "derecha";
  /** El lugar de la tarjeta en la página: las que se ven al entrar se
   *  despliegan en cascada, no todas juntas. */
  orden?: number;
  className?: string;
  children: ReactNode;
}) {
  const nodo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = nodo.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Con "reducir movimiento" también: ahí el CSS cambia el despliegue por
    // un fundido, que igual tiene que esperar a que la tarjeta se vea.

    const caja = el.getBoundingClientRect();
    if (caja.top < window.innerHeight && caja.bottom > 0) return;

    el.dataset.despliegue = "en-espera";
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        el.dataset.despliegue = "activo";
        observador.disconnect();
      },
      // Que se vea un poco antes de arrancar: si arrancara con un píxel
      // adentro, el despliegue pasaría casi entero debajo del borde.
      { threshold: 0.15 },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={nodo}
      className={`despliegue ${forma === "derecha" ? "despliegue--derecha" : ""} ${className}`}
      style={{ "--despliegue-orden": orden } as CSSProperties}
    >
      {children}
    </div>
  );
}
