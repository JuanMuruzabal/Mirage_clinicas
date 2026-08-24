"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QuadrantMark } from "./quadrant-mark";

interface ExpandableCardProps {
  eyebrow: string;
  titulo: string;
  descripcion: string;
  detalle: string[];
}

// Tarjeta que se despliega al presionarla (Home, "cómo funciona") — un
// desplegable real con más información, no solo hover. La altura anima
// hacia/desde "auto" (framer-motion lo soporta directo) para que el
// despliegue quede suave, no un salto brusco. Identidad cálida (TR-015 en
// docs/tradeoffs.md, pedido explícito del cliente: "el home solo cambiar
// las tarjetas y botones") — solo color/forma/sombra, la tipografía
// condensada del título queda igual que el resto del Home.
export function ExpandableCard({ eyebrow, titulo, descripcion, detalle }: ExpandableCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="group relative rounded-card border-[0.5px] border-arena bg-marfil shadow-soft transition-colors duration-300 hover:border-salvia hover:bg-hueso">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-col items-start gap-3 p-10 text-left"
      >
        <QuadrantMark className="absolute right-8 top-8 text-salvia transition-transform duration-300 group-hover:scale-110 group-hover:text-salvia-oscuro" />
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">{eyebrow}</p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold uppercase tracking-tight text-grafito transition-transform duration-300 group-hover:-translate-y-0.5">
          {titulo}
        </h2>
        <p className="text-sm text-grafito/60">{descripcion}</p>
        <span className="mt-3 flex items-center gap-1.5 text-sm font-medium text-salvia-oscuro">
          {open ? "Ver menos" : "Ver más"}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            aria-hidden="true"
          >
            ↓
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detalle"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ul className="flex flex-col gap-2.5 border-t-[0.5px] border-arena px-10 py-6 text-sm text-grafito/60">
              {detalle.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden="true" className="text-salvia-oscuro">
                    —
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
