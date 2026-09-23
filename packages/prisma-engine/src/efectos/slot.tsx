"use client";

import { lazy, Suspense, type ReactNode } from "react";
import { EFECTOS_POR_ID, type IntensidadEfecto } from "./catalogo";

const CARGADORES = {
  entrada: () => import("./entrada"),
  texto: () => import("./texto"),
  interaccion: () => import("./interaccion"),
  fondo: () => import("./fondo"),
  conteo: () => import("./conteo"),
} as const;
const IMPLEMENTACIONES = {
  entrada: lazy(CARGADORES.entrada),
  texto: lazy(CARGADORES.texto),
  interaccion: lazy(CARGADORES.interaccion),
  fondo: lazy(CARGADORES.fondo),
  conteo: lazy(CARGADORES.conteo),
} as const;

export function EfectoSlot({ id, intensidad = "sutil", children }: { id?: string; intensidad?: IntensidadEfecto; children: ReactNode }) {
  if (!id || !EFECTOS_POR_ID[id]?.habilitado) return children;
  const efecto = EFECTOS_POR_ID[id];
  const grupo = id === "conteo" ? "conteo" : efecto.objetivo === "fondo" ? "fondo" : efecto.disparador === "entrada" ? "entrada" : efecto.disparador === "continuo" && efecto.objetivo === "texto" ? "texto" : "interaccion";
  const Implementacion = IMPLEMENTACIONES[grupo];
  return <Suspense fallback={<>{children}</>}><Implementacion id={id} intensidad={intensidad}>{children}</Implementacion></Suspense>;
}
