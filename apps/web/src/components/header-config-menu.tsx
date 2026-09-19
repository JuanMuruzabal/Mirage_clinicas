"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { IconLogout, IconSettings, IconUser, IconUsers } from "./icons";

const itemClass =
  "flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition-colors hover:bg-salvia-claro hover:text-salvia-oscuro";

// HeaderConfigMenu — TR-060 en docs/Arquitectura y base/tradeoffs.md (versión original: Tu
// perfil/Gestionar tu clínica/Personalizar tu página). Reducido a Tu
// perfil + Cerrar sesión (TR-075 en docs/Arquitectura y base/tradeoffs.md, 2026-08-27,
// pedido explícito del cliente) — "Gestionar tu clínica" y "Personalizar
// tu página" quedaron redundantes con el nuevo botón "Panel" del sidebar
// (que ahora es alcanzable también en mobile vía el ícono de hamburguesa
// del header, ver PanelSidebar) y con el propio sidebar de /panel/**;
// este menú pasa a ser puramente de cuenta (ver perfil / cerrar sesión),
// no de navegación. "Cerrar sesión" vivía solo en /perfil (pedido
// explícito del cliente, 2026-08-23) — ya no es una excepción, ahora
// vive acá TAMBIÉN (se mantiene en /perfil, sin sacar nada de ahí).
export function HeaderConfigMenu({ icono = "tuerca" }: { icono?: "tuerca" | "colaboradores" }) {
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
        className={
          icono === "colaboradores"
            ? "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            : "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-current transition-colors hover:bg-current/10"
        }
      >
        {/* En /clinicas, el MISMO botón que el de colaboradores del
            resto de las pantallas: un disco verde de 36 px en el mismo
            lugar, para que al navegar no cambie de forma ni salte
            (2026-09-19, segunda vuelta del pedido). Lo único distinto es
            lo que lleva adentro — ahí todavía no hay clínica elegida, y
            por lo tanto no hay avatares de nadie que apilar. */}
        {icono === "colaboradores" ? (
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-marfil bg-salvia-oscuro text-marfil"
          >
            <IconUsers className="h-[18px] w-[18px]" />
          </span>
        ) : (
          <IconSettings className="h-5 w-5" />
        )}
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
