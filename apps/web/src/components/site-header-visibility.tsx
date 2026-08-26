"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isAuthFlowRoute, isClinicaPublicaRoute } from "@/lib/site-routes";

/**
 * SiteHeaderVisibility — pedido explícito del cliente, 2026-08-23: la
 * página pública de una clínica (`/{slug}`) no debe mostrar el header
 * global de Mirage, solo el suyo propio (ver ClinicaPublicaTemplate).
 * Mismo patrón que SiteFooterVisibility: SiteHeader podría quedar como
 * Server Component puro, pero decidir SI se muestra necesita la ruta
 * actual (usePathname, solo en cliente) — este wrapper recibe el header ya
 * renderizado como children y decide mostrarlo u ocultarlo.
 *
 * También oculto en el flujo de auth (sumarse/ingresar/recuperar-password/
 * verificar-mail, bug real reportado por el cliente 2026-08-26) —
 * `AuthShell` trae su propio "Volver al inicio", el header global (con
 * "Ingresar"/"Sumate" o los links de una cuenta con sesión) no aporta acá.
 */
export function SiteHeaderVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isClinicaPublicaRoute(pathname) || isAuthFlowRoute(pathname)) return null;
  return <>{children}</>;
}
