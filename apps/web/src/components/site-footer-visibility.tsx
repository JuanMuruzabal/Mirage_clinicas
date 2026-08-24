"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isFooterHidden } from "@/lib/site-routes";

/**
 * SiteFooter podría quedar como Server Component puro, pero decidir SI se
 * muestra necesita la ruta actual (usePathname, solo en cliente) — mismo
 * problema y misma solución que Marcuzzi_Madryn (SiteFooterVisibility de
 * ese proyecto): este wrapper recibe el footer ya renderizado como
 * children y decide mostrarlo u ocultarlo.
 */
export function SiteFooterVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isFooterHidden(pathname)) return null;
  return <>{children}</>;
}
