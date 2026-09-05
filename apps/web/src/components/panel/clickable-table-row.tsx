"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, ReactNode } from "react";

interface ClickableTableRowProps {
  href: string;
  className?: string;
  children: ReactNode;
  // mobileOnClick — corrección de QA (2026-09-06, tabla de Pacientes en
  // mobile no dejaba ver toda la info y el chevron para desplegarla era
  // difícil de acertar): por debajo del breakpoint `md` de Tailwind
  // (767px), tocar la fila llama a esto EN VEZ de navegar — mismo
  // criterio que TurnosTable, donde tocar la fila siempre despliega el
  // panel de más info, nunca navega sola. Sin esta prop, el
  // comportamiento de siempre (TR-023, toda la fila navega) sigue
  // intacto en cualquier ancho — sigue siendo el caso de
  // TurnoDetalle/otras tablas que no la usan.
  mobileOnClick?: () => void;
}

// breakpointMd — 768px, el breakpoint `md` por default de Tailwind (ver
// tailwind.config / la convención `max-md:`/`md:` usada en todo el panel).
const mqMobile = "(max-width: 767px)";

// ClickableTableRow (pedido explícito del cliente, 2026-08-23: "las tablas
// de pacientes... deben ser clickeables") — toda la fila navega, no solo
// el link de texto. El link real (ej. "Ver ficha →") se mantiene en su
// celda para que siga siendo accesible por teclado/lector de pantalla
// (tabIndex normal, foco visible, funciona igual sin JS); el click en
// cualquier otro punto de la fila es una comodidad extra para mouse, no
// reemplaza al link — así no se pierde accesibilidad por sumar la
// comodidad.
export function ClickableTableRow({ href, className = "", children, mobileOnClick }: ClickableTableRowProps) {
  const router = useRouter();

  // esMobile — se lee al momento del click, no con un listener de resize
  // persistente: alcanza con saber el ancho actual en el instante en que
  // se toca la fila, no hace falta reaccionar a cambios de tamaño en vivo
  // para esto.
  function esMobile(): boolean {
    return typeof window !== "undefined" && window.matchMedia(mqMobile).matches;
  }

  function irAlDetalle(e: React.MouseEvent<HTMLTableRowElement>) {
    // Si el click fue sobre un link/botón propio de la fila, dejar que
    // ese elemento maneje su propia navegación — no duplicar el push.
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (mobileOnClick && esMobile()) {
      mobileOnClick();
      return;
    }
    router.push(href);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" && !(e.target as HTMLElement).closest("a, button")) {
      if (mobileOnClick && esMobile()) {
        mobileOnClick();
        return;
      }
      router.push(href);
    }
  }

  return (
    <tr onClick={irAlDetalle} onKeyDown={onKeyDown} className={`cursor-pointer ${className}`}>
      {children}
    </tr>
  );
}
