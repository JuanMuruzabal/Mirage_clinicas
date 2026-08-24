"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isClinicaPublicaRoute } from "@/lib/site-routes";

/**
 * SiteHeaderVisibility — pedido explícito del cliente, 2026-08-23: la
 * página pública de una clínica (`/{slug}`) no debe mostrar el header
 * global de Mirage, solo el suyo propio (ver ClinicaPublicaTemplate).
 * Mismo patrón que SiteFooterVisibility: SiteHeader podría quedar como
 * Server Component puro, pero decidir SI se muestra necesita la ruta
 * actual (usePathname, solo en cliente) — este wrapper recibe el header ya
 * renderizado como children y decide mostrarlo u ocultarlo.
 */
export function SiteHeaderVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isClinicaPublicaRoute(pathname)) return null;
  return <>{children}</>;
}
