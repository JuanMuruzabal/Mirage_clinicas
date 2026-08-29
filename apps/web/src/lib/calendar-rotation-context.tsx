"use client";

import { createContext, useContext } from "react";

// CalendarRotationContext — F2.2 (docs/implementation-plan.md §11,
// pedido explícito del cliente, 2026-08-29): "los botones, pantallas
// dentro de calendario también se deben adaptar a la rotación". Los
// modales de turnos (TurnoDetalle/AgregarTurnoModal/EditarTurnoModal/
// CancelarTurnoModal) se montan vía un portal directo a `document.body`
// (ModalPortal, TR-030 en docs/tradeoffs.md) — quedan AFUERA del árbol
// de CalendarView en el DOM real, así que no heredan la rotación por CSS
// de ese contenedor con solo estar anidados ahí en JSX. Este contexto es
// la única forma de que ModalPortal (que no sabe nada de calendarios)
// se entere de que tiene que rotarse también — CalendarView es el único
// lugar que lo provee con un valor distinto de `false`; cualquier otro
// modal de la app (fuera de /panel/calendario) queda sin proveedor, así
// que `useCalendarRotation()` devuelve el default (sin rotar), sin
// cambiar nada ahí.
export const CalendarRotationContext = createContext(false);

export function useCalendarRotation(): boolean {
  return useContext(CalendarRotationContext);
}
