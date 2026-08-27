"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { IconLogout, IconSettings, IconUser } from "./icons";

const itemClass =
  "flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition-colors hover:bg-salvia-claro hover:text-salvia-oscuro";

// HeaderConfigMenu — TR-060 en docs/tradeoffs.md (versión original: Tu
// perfil/Gestionar tu clínica/Personalizar tu página). Reducido a Tu
// perfil + Cerrar sesión (TR-075 en docs/tradeoffs.md, 2026-08-27,
// pedido explícito del cliente) — "Gestionar tu clínica" y "Personalizar
// tu página" quedaron redundantes con el nuevo botón "Panel" del sidebar
// (que ahora es alcanzable también en mobile vía el ícono de hamburguesa
// del header, ver PanelSidebar) y con el propio sidebar de /panel/**;
// este menú pasa a ser puramente de cuenta (ver perfil / cerrar sesión),
// no de navegación. "Cerrar sesión" vivía solo en /perfil (pedido
// explícito del cliente, 2026-08-23) — ya no es una excepción, ahora
// vive acá TAMBIÉN (se mantiene en /perfil, sin sacar nada de ahí).
export function HeaderConfigMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-configuracion"
        aria-label={open ? "Cerrar accesos rápidos" : "Accesos rápidos"}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-current transition-colors hover:bg-current/10"
      >
        <IconSettings className="h-5 w-5" />
      </button>
      {open && (
        <nav
          id="menu-configuracion"
          aria-label="Accesos rápidos"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-10 flex w-56 flex-col gap-1 rounded-card border-[0.5px] border-arena bg-marfil p-2 text-grafito shadow-soft"
        >
          <Link href="/perfil" onClick={() => setOpen(false)} className={itemClass}>
            <IconUser className="h-[18px] w-[18px] flex-shrink-0" />
            Tu perfil
          </Link>
          {/* display:contents (no un <form> normal): mismo motivo que
              LogoutButton — como hijo directo de este <nav> flex-col, un
              <form> de bloque metería su propia caja y le sumaría un
              gap extra distinto al de los demás items. */}
          <form action={logoutAction} className="contents">
            <button type="submit" className={`${itemClass} text-left`}>
              <IconLogout className="h-[18px] w-[18px] flex-shrink-0" />
              Cerrar sesión
            </button>
          </form>
        </nav>
      )}
    </div>
  );
}
