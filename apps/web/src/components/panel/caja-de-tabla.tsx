"use client";

import { useRef, type ReactNode } from "react";
import { CLASE_ALTO_LIBRE, useAltoDeFilas, useAltoLibre } from "@/lib/alto-de-filas";

// CajaDeTabla — la caja con scroll de una tabla del panel, que en el celular
// mide por lo menos cuatro filas enteras antes del scroll (ver
// lib/alto-de-filas.ts). En una pantalla del panel (`llenaLaPantalla`) crece
// hasta el espacio libre de la pantalla y no lleva otra clase de alto; en un
// diálogo, la pone quien la usa, con
// `max-md:max-h-[var(--alto-mobile,<el alto de siempre>)]`.
export function CajaDeTabla({
  className,
  llenaLaPantalla = false,
  children,
}: {
  className: string;
  llenaLaPantalla?: boolean;
  children: ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  useAltoDeFilas(caja);
  useAltoLibre(caja, llenaLaPantalla);
  return (
    <div ref={caja} className={llenaLaPantalla ? `${className} ${CLASE_ALTO_LIBRE}` : className}>
      {children}
    </div>
  );
}
