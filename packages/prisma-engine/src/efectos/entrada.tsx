"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { IntensidadEfecto } from "./catalogo";

const desplazamiento: Record<IntensidadEfecto, number> = { sutil: 3, media: 6, marcada: 9 };

export default function EfectoEntrada({ id, intensidad, children }: { id: string; intensidad: IntensidadEfecto; children: React.ReactNode }) {
  const reducido = useReducedMotion();
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
      whileInView={reducido ? undefined : final}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: id === "revelado-scroll" ? 0.72 : 0.52, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
