"use client";

import { useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { IntensidadEfecto } from "./catalogo";

const desplazamiento: Record<IntensidadEfecto, number> = { sutil: 3, media: 6, marcada: 9 };

// Con movimiento reducido el contenido tiene que quedar en su estado FINAL
// (PP-1, H1). `useReducedMotion()` vale `null` en el primer render y recién
// después pasa a `true`; para entonces Motion ya montó con `initial` y ese
// prop no se vuelve a aplicar. Por eso no alcanza con apagar `initial`: si
// el hook cambia a `true`, se anima explícitamente hacia el final (con
// duración cero). El CSS de `prefers-reduced-motion` en globals.css cubre
// además el HTML del servidor y el instante antes de hidratar.
//
// La preferencia se mira recién DESPUÉS de hidratar (PP-7): en el cliente
// `useReducedMotion()` ya puede valer `true` en el render de hidratación, y
// ese render dibujaba el estado final mientras el HTML del servidor —que no
// conoce la preferencia— traía el inicial. React lo marca como desajuste de
// hidratación (28 por página en las de demostración) y no lo corrige. Con
// `hidratado`, el primer render del cliente es igual al del servidor y el
// siguiente anima al final con duración cero, que es el camino de arriba.
const sinSuscripcion = () => () => {};

export default function EfectoEntrada({ id, intensidad, children }: { id: string; intensidad: IntensidadEfecto; children: React.ReactNode }) {
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const preferencia = useReducedMotion();
  const reducido = hidratado && preferencia;
  const mover = id === "deslizar-suave" || id === "revelado-scroll";
  const inicial = mover
    ? { opacity: 0.94, y: desplazamiento[intensidad] }
    : { opacity: 0.94, filter: "blur(1px)" };
  const final = mover ? { opacity: 1, y: 0 } : { opacity: 1, filter: "blur(0px)" };
  return (
    <motion.div
      data-pp-efecto={id}
      data-pp-intensidad={intensidad}
      initial={reducido ? false : inicial}
      animate={reducido ? final : undefined}
      whileInView={reducido ? undefined : final}
      viewport={{ once: true, amount: 0.12 }}
      transition={reducido ? { duration: 0 } : { duration: id === "revelado-scroll" ? 0.72 : 0.52, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
