"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";

interface ClickableTableRowProps {
  href: string;
  className?: string;
  children: ReactNode;
}

// ClickableTableRow (pedido explícito del cliente, 2026-08-23: "las tablas
// de pacientes... deben ser clickeables") — toda la fila navega, no solo
// el link de texto. El link real (ej. "Ver ficha →") se mantiene en su
// celda para que siga siendo accesible por teclado/lector de pantalla
// (tabIndex normal, foco visible, funciona igual sin JS); el click en
// cualquier otro punto de la fila es una comodidad extra para mouse, no
// reemplaza al link — así no se pierde accesibilidad por sumar la
// comodidad.
export function ClickableTableRow({ href, className = "", children }: ClickableTableRowProps) {
  const router = useRouter();

  function irAlDetalle(e: React.MouseEvent<HTMLTableRowElement>) {
    // Si el click fue sobre un link/botón propio de la fila, dejar que
    // ese elemento maneje su propia navegación — no duplicar el push.
    if ((e.target as HTMLElement).closest("a, button")) return;
    router.push(href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" && !(e.target as HTMLElement).closest("a, button")) {
      router.push(href);
    }
  }

  return (
    <tr onClick={irAlDetalle} onKeyDown={onKeyDown} className={`cursor-pointer ${className}`}>
      {children}
    </tr>
  );
}
