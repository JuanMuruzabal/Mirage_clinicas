"use client";

import { useRef, type ReactNode } from "react";
import { useAltoDeFilas } from "@/lib/alto-de-filas";

// CajaDeTabla — la caja con scroll de una tabla del panel, que en el celular
// mide lo justo para cuatro filas enteras antes del scroll (ver
// lib/alto-de-filas.ts). La clase de alto la pone quien la usa, con
// `max-md:max-h-[var(--alto-mobile,<el alto de siempre>)]`.
export function CajaDeTabla({ className, children }: { className: string; children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  useAltoDeFilas(caja);
  return (
    <div ref={caja} className={className}>
      {children}
    </div>
  );
}
