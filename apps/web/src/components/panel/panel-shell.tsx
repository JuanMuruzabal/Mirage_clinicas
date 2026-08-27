"use client";

import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

/**
 * Envuelve la raíz de gestión de clínica (sidebar + `<main>`) — rama
 * fix/mobile, octava corrección 2026-08-24 (ver TR-031 en
 * docs/tradeoffs.md, pedido explícito del cliente: "sigue sin responder
 * el movimiento vertical en el apartado de calendario... se arregla
 * momentáneamente cuando cambio de dia a semana... mismo problema
 * cuando toco la ficha de un paciente").
 *
 * Causa real: un bug conocido de iOS Safari — un contenedor con
 * `overflow: auto` (acá, `<main>`) no siempre "nota" que apareció
 * contenido nuevo (o que recién se montó) hasta que ALGO dispara un
 * reflow externo del layout. El clic en Día/Semana/Mes (o cualquier otro
 * cambio de estado que toque el DOM) termina siendo ese disparador por
 * accidente — de ahí que "se arregle solo" al tocar cualquier botón, y
 * que el mismo síntoma aparezca al entrar en frío a la ficha de un
 * paciente (otra página recién montada, mismo `<main>` compartido —
 * `app/panel/layout.tsx` no se remonta al navegar dentro de `/panel/**`,
 * así que el único disparador real de este efecto es el cambio de ruta).
 *
 * El arreglo: forzar un reflow real (alternar `display` y leer
 * `offsetHeight`, no alcanza con solo leerlo) cada vez que cambia la
 * ruta — con `useLayoutEffect` (no `useEffect`) para que corra ANTES de
 * que el navegador pinte el siguiente frame, así el toggle nunca se
 * llega a ver (sin esto, con `useEffect`, habría un parpadeo real: el
 * usuario vería el sidebar/contenido desaparecer y reaparecer).
 *
 * De paso, se saca `WebkitOverflowScrolling: "touch"` de `<main>` — esa
 * propiedad es vestigial en iOS moderno (el scroll con inercia es nativo
 * para `overflow: auto` desde iOS 13, no hace falta declararla) y hay
 * reportes documentados de que, en algunas versiones de WebKit, declararla
 * explícitamente es justamente lo que dispara este tipo de bug de
 * "contenido nuevo no reconocido" — sacarla es la corrección más segura
 * antes de sumar el reflow forzado como respaldo.
 */
export function PanelShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prevDisplay = el.style.display;
    el.style.display = "none";
    void el.offsetHeight;
    el.style.display = prevDisplay;
  }, [pathname]);

  return (
    // overflow-x-hidden sin prefijo (TR-064 en docs/tradeoffs.md, pedido
    // explícito del cliente: "agregá overflow-x-hidden en el contenedor
    // raíz del layout del panel... ningún elemento debe generar scroll
    // horizontal a nivel documento") — resguardo de última instancia en
    // CUALQUIER ancho, no solo mobile. `max-md:overflow-hidden` (de
    // antes, TR-026/027) ya cubre las dos direcciones debajo de 768px;
    // esto suma el eje horizontal también arriba de ese breakpoint, sin
    // tocar el vertical (que en escritorio sí necesita poder crecer:
    // documento normal, sin el bloqueo de `.panel-locked`).
    <div
      ref={ref}
      className="panel-texture panel-shell-h flex flex-1 overflow-x-hidden pt-[var(--header-height)] max-md:overflow-hidden"
    >
      {children}
    </div>
  );
}
