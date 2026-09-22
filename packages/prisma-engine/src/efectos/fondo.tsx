"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { IntensidadEfecto } from "./catalogo";

export default function FondoAnimado({ id, intensidad, children }: { id?: string; intensidad: IntensidadEfecto; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || !id || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => setActivo(entry.isIntersecting && document.visibilityState === "visible"), { threshold: 0 });
    observer.observe(nodo);
    const cambio = () => setActivo(document.visibilityState === "visible" && nodo.getBoundingClientRect().bottom > 0 && nodo.getBoundingClientRect().top < innerHeight);
    document.addEventListener("visibilitychange", cambio);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", cambio); };
  }, [id]);
  if (!id) return children;
  return (
    <div ref={ref} className="pp-fondo-vivo" data-pp-fondo={id} data-pp-activo={activo ? "true" : "false"} data-pp-intensidad={intensidad}>
      <div className="pp-fondo-vivo__contenido">{children}</div>
      <span aria-hidden="true" className="pp-fondo-vivo__capa" />
    </div>
  );
}
