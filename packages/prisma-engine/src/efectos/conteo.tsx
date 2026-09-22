"use client";

import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import type { IntensidadEfecto } from "./catalogo";

function textoDeNodo(nodo: ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (isValidElement<{ children?: ReactNode }>(nodo)) return textoDeNodo(nodo.props.children);
  return "";
}

function reemplazarTexto(nodo: ReactNode, texto: string): ReactNode {
  if (isValidElement<{ children?: ReactNode }>(nodo)) return cloneElement(nodo, undefined, texto);
  return texto;
}

export default function ConteoAnimado({ intensidad, children }: { id: string; intensidad: IntensidadEfecto; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const original = textoDeNodo(children);
  const numero = Number(original.replace(/[^\d-]/g, ""));
  const [actual, setActual] = useState<number | null>(null);
  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || !Number.isFinite(numero) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || document.visibilityState !== "visible") return;
      const inicio = performance.now();
      const duracion = intensidad === "marcada" ? 1300 : intensidad === "media" ? 1000 : 750;
      let frame = 0;
      const avanzar = (ahora: number) => {
        const progreso = Math.min(1, (ahora - inicio) / duracion);
        const suave = 1 - (1 - progreso) ** 3;
        setActual(Math.round(numero * suave));
        if (progreso < 1 && document.visibilityState === "visible") frame = requestAnimationFrame(avanzar);
      };
      frame = requestAnimationFrame(avanzar);
      observer.disconnect();
      return () => cancelAnimationFrame(frame);
    }, { threshold: 0.2 });
    observer.observe(nodo);
    return () => observer.disconnect();
  }, [intensidad, numero]);
  const mostrado = actual === null ? children : reemplazarTexto(children, new Intl.NumberFormat("es-AR").format(actual));
  return <span ref={ref} data-pp-efecto="conteo">{mostrado}</span>;
}
