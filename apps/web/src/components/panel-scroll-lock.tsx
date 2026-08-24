"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isPanelRoute } from "@/lib/site-routes";

/**
 * Bloquea el scroll del documento (`html`/`body`) mientras se está dentro
 * de gestión de clínica (`/panel/**`), solo en mobile (ver `globals.css`,
 * `.panel-locked` debajo de 768px) — rama fix/mobile, corrección
 * 2026-08-24 sobre TR-026 (ver TR-027 en docs/tradeoffs.md).
 *
 * Por qué hace falta esto además de la "estructura fija" ya armada
 * (header `fixed`, sidebar hermano de `<main>`, `<main>` como único
 * `overflow-auto`): esos tres ya estaban correctamente afuera del
 * contenedor que scrollea — no era un bug de anidamiento en el DOM. El
 * bug real es un comportamiento conocido de mobile Safari: cuando un
 * gesto táctil dentro de un scroll anidado (el calendario, las tablas)
 * llega a su borde, el "rebote elástico" (overscroll) puede filtrarse
 * hacia el documento — y como `position: fixed` ancla al viewport
 * visual, ese rebote del documento arrastra visualmente al header aunque
 * nunca estuvo dentro del contenedor que scrollea. Bloquear el documento
 * por completo (en vez de solo el contenedor raíz de `/panel`, que ya
 * tenía su propio `overflow-hidden`) cierra esa vía de filtración.
 *
 * Mismo patrón que `SiteHeaderVisibility`/`SiteFooterVisibility` (un
 * wrapper cliente aparte porque decidir esto necesita `usePathname`),
 * pero acá el efecto es tocar `document.documentElement` directo — mismo
 * criterio que ya usa `HeaderFrame` para `--header-height`. Se limpia
 * solo (clase removida) al salir de `/panel/**`, así que nunca deja
 * bloqueado el resto del sitio.
 */
export function PanelScrollLock() {
  const pathname = usePathname();
  const locked = isPanelRoute(pathname);

  useEffect(() => {
    document.documentElement.classList.toggle("panel-locked", locked);
    return () => {
      document.documentElement.classList.remove("panel-locked");
    };
  }, [locked]);

  return null;
}
