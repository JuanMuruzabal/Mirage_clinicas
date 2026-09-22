"use client";

import { Children, cloneElement, isValidElement, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { IntensidadEfecto } from "./catalogo";

export default function EfectoTexto({ id, intensidad, children }: { id: string; intensidad: IntensidadEfecto; children: ReactNode }) {
  const textoPlano = (nodo: ReactNode): string => {
    if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
    if (isValidElement<{ children?: ReactNode }>(nodo)) return textoPlano(nodo.props.children);
    return Children.toArray(nodo).map(textoPlano).join("");
  };
  const reemplazarTexto = (nodo: ReactNode, texto: string): ReactNode => {
    if (typeof nodo === "string" || typeof nodo === "number") return texto;
    if (isValidElement<{ children?: ReactNode }>(nodo)) return cloneElement(nodo, undefined, reemplazarTexto(nodo.props.children, texto));
    const lista = Children.toArray(nodo);
    let reemplazado = false;
    return lista.map((hijo) => {
      if (reemplazado) return hijo;
      const nuevo = reemplazarTexto(hijo, texto);
      if (nuevo !== hijo) reemplazado = true;
      return nuevo;
    });
  };
  const original = textoPlano(children);
  const frases = original.split(/\s+[·|]\s+/).filter(Boolean);
  const palabras = original.trim().split(/\s+/).filter(Boolean);
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    if (id !== "frases-rotativas" || frases.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setIndice((i) => (i + 1) % frases.length);
    }, intensidad === "marcada" ? 4200 : 6000);
    return () => window.clearInterval(timer);
  }, [id, intensidad, frases.length]);

  if (id === "frases-rotativas" && frases.length > 1) return <span data-pp-efecto={id} aria-live="off">{reemplazarTexto(children, frases[indice])}</span>;
  if (id === "palabras" && original.trim()) {
    return <span data-pp-efecto={id}>{palabras.map((palabra, i) => <span key={`${i}-${palabra}`} className="pp-palabra" style={{ "--pp-palabra-orden": i } as CSSProperties}>{palabra}{i < palabras.length - 1 ? " " : ""}</span>)}</span>;
  }
  return <span data-pp-efecto={id} data-pp-intensidad={intensidad}>{children}</span>;
}
