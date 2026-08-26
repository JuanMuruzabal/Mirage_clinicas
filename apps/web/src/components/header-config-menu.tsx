"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconClinic, IconPersonalize, IconSettings, IconUser } from "./icons";

const ITEMS = [
  { href: "/perfil", label: "Tu perfil", Icon: IconUser },
  { href: "/panel", label: "Gestionar tu clínica", Icon: IconClinic },
  { href: "/personalizar-pagina", label: "Personalizar tu página", Icon: IconPersonalize },
] as const;

// HeaderConfigMenu — TR-060 en docs/tradeoffs.md, pedido explícito del
// cliente (2026-08-26): en las pantallas de herramienta ya con sesión
// completa (/seleccionar-servicio, /panel, /perfil, /personalizar-pagina)
// los tres links de siempre se consolidan en un único botón de
// configuración que despliega el acceso rápido, en vez de ocupar lugar
// en la fila del header — mismo ícono/comportamiento en mobile y
// desktop, ninguno de los dos necesita el dropdown de hamburguesa
// (a diferencia del estado anónimo, este es un solo botón compacto que
// nunca desborda).
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
          className="absolute right-0 top-[calc(100%+0.5rem)] z-10 flex w-64 flex-col gap-1 rounded-card border-[0.5px] border-arena bg-marfil p-2 text-grafito shadow-soft"
        >
          {ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-field px-3 py-2.5 text-sm font-medium transition-colors hover:bg-salvia-claro hover:text-salvia-oscuro"
            >
              <Icon className="h-[18px] w-[18px] flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
