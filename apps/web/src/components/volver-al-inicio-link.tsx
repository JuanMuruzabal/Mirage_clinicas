"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinkClass } from "@/lib/styles";

// "Volver al inicio" (pedido explícito del cliente, 2026-08-23) — solo
// visible en /seleccionar-servicio ("solo volver al inicio se vera de
// /seleccionar-servicio"), no en el resto de las pantallas logueadas: ahí
// el logo del header ya no lleva a la home pública (lleva de vuelta a
// /seleccionar-servicio), así que esto es la única forma de volver a la
// home pública desde esa pantalla puntual. De ahí que sea su propio
// Client Component con `usePathname`, en vez de una condición fija dentro
// de SiteHeader (Server Component, sin acceso a la ruta actual).
export function VolverAlInicioLink() {
  const pathname = usePathname();
  if (pathname !== "/seleccionar-servicio") return null;
  return (
    <Link href="/" className={navLinkClass}>
      ← Volver al inicio
    </Link>
  );
}
