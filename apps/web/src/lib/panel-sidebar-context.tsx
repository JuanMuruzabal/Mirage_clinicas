"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * PanelSidebarProvider — TR-075 en docs/Arquitectura y base/tradeoffs.md (2026-08-27, pedido
 * explícito del cliente: "el sidebar debe ser desplegable desde el
 * header... en mobile"). El ícono que abre el sidebar vive en
 * `SiteHeaderChrome` (montado una sola vez en el layout raíz, fuera de
 * `/panel/**`) y el propio sidebar (`PanelSidebar`) vive adentro de
 * `app/panel/layout.tsx` — dos ramas del árbol sin relación padre/hijo
 * directa, así que necesitan un estado compartido en un ancestro común
 * (acá, el layout raíz) para poder comunicarse. Sin efecto visual propio
 * — es solo contexto, no agrega ningún nodo al DOM — así que envolver
 * TODO el sitio con esto (no solo `/panel/**`) no tiene costo real.
 */
interface PanelSidebarContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const PanelSidebarContext = createContext<PanelSidebarContextValue | null>(null);

export function PanelSidebarProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // EL DRAWER SE CIERRA EN CADA NAVEGACIÓN, y vive acá y no en
  // `PanelSidebar` (2026-09-19, pedido del cliente: "cada vez que se
  // salga de la página /panel en mobile retraer el sidebar, y cada vez
  // que se entre este debe estar retraído").
  //
  // La lógica ESTABA en PanelSidebar, y ahí no alcanzaba: ese componente
  // vive en `app/panel/layout.tsx`, así que **se desmonta al salir de
  // /panel** — justo la navegación que había que atender. Se iba con el
  // drawer abierto, y como este provider vive en el layout RAÍZ y
  // sobrevive a la navegación, al volver a /panel el drawer aparecía ya
  // desplegado. El estado y la regla que lo gobierna tienen que vivir en
  // el mismo lugar.
  //
  // Cerrar en CUALQUIER cambio de ruta cubre las dos mitades del pedido
  // de una sola vez: salir de /panel lo retrae, y entrar a /panel es
  // también un cambio de ruta, así que nunca se llega con el drawer
  // abierto. Una recarga parada en /panel arranca en `false` por el
  // `useState`.
  //
  // "Adjusting state when a prop changes" (https://react.dev/learn/you-might-not-need-an-effect)
  // y no un `useEffect`: es el patrón que ya usa el resto del proyecto
  // (site-header-chrome.tsx, useEstadoDelServidor) y evita el setState
  // síncrono dentro de un efecto, que el lint rechaza.
  const [ultimaRuta, setUltimaRuta] = useState(pathname);
  if (pathname !== ultimaRuta) {
    setUltimaRuta(pathname);
    if (open) setOpen(false);
  }

  const value: PanelSidebarContextValue = {
    open,
    toggle: () => setOpen((o) => !o),
    close: () => setOpen(false),
  };
  return <PanelSidebarContext.Provider value={value}>{children}</PanelSidebarContext.Provider>;
}

export function usePanelSidebar(): PanelSidebarContextValue {
  const ctx = useContext(PanelSidebarContext);
  if (!ctx) {
    throw new Error("usePanelSidebar debe usarse dentro de <PanelSidebarProvider>");
  }
  return ctx;
}
