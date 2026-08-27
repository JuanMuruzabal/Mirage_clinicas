"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * PanelSidebarProvider — TR-075 en docs/tradeoffs.md (2026-08-27, pedido
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
  const [open, setOpen] = useState(false);
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
