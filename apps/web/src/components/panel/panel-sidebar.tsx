"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconCalendario, IconGeneral, IconPacientes, IconPagina, IconPerfil, IconTurnos } from "./sidebar-icons";

const NAV_ITEMS = [
  { href: "/panel", label: "General", Icon: IconGeneral },
  { href: "/panel/calendario", label: "Calendario", Icon: IconCalendario },
  { href: "/panel/turnos", label: "Turnos", Icon: IconTurnos },
  { href: "/panel/pacientes", label: "Pacientes", Icon: IconPacientes },
];

// Sidebar retráctil, fijo respecto al scroll (spec §4.1: "acompaña al
// usuario sin importar cuánto scrollee") — sticky bajo el header fixed,
// con su propia altura de viewport, así el contenido de cada sección
// scrollea por separado sin arrastrar el sidebar.
//
// `collapsed` sigue siendo la única señal (sin variante mobile aparte,
// TR-025 en docs/tradeoffs.md) — el cliente prefiere el control manual
// de siempre (la flechita) sobre un riel forzado por viewport.
//
// Sexta vuelta, rama fix/mobile (2026-08-24 — ver TR-029 en
// docs/tradeoffs.md), dos ajustes puntuales pedidos por el cliente:
// (a) colapsado pasa de w-16 (64px) a 52px exactos, con los íconos
// centrados (antes quedaban pegados a la izquierda dentro del riel,
// `justify-center` solo aplica cuando no hay label al lado empujándolos);
// (b) "Tu página"/"Tu perfil" suman ícono propio (`IconPagina`/
// `IconPerfil`, mismo set que sidebar-icons.tsx) — antes eran texto
// plano, sin nada que mostrar cuando estaba colapsado más que un "•".
export function PanelSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    // .panel-sidebar-h (rama fix/mobile, sexta vuelta — ver TR-029 en
    // docs/tradeoffs.md): reemplaza el `max-md:h-[calc(100dvh-...)]`
    // anterior — esa única declaración se perdía entera en un navegador
    // sin soporte de `dvh` (valor inválido, la propiedad completa se
    // ignora, el alto quedaba sin acotar). La clase (definida en
    // globals.css) declara la MISMA propiedad dos veces, `vh` primero y
    // `dvh` después — el navegador se queda con la última declaración
    // que sepa interpretar, así que sigue funcionando en cualquiera.
    <aside
      className={`panel-sidebar-h sticky top-[var(--header-height)] flex h-[calc(100vh-var(--header-height))] flex-shrink-0 flex-col border-r-[0.5px] border-arena bg-marfil transition-[width] duration-300 ${
        collapsed ? "w-[52px]" : "w-60"
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expandir menú" : "Retraer menú"}
        aria-expanded={!collapsed}
        className="flex items-center justify-center border-b-[0.5px] border-arena py-3 text-grafito/50 hover:text-grafito"
      >
        <span aria-hidden="true" className={`inline-block transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}>
          ←
        </span>
      </button>

      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Gestión de clínica">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium transition-colors ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-salvia-claro text-salvia-oscuro" : "text-grafito hover:bg-arena"}`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t-[0.5px] border-arena p-3">
        {/* "Personalizá tu página" es su propia área, fuera de gestión de
            clínica (pedido explícito del cliente, 2026-08-23) — no vive
            bajo /panel/**, por eso no está en NAV_ITEMS de acá arriba. */}
        <Link
          href="/personalizar-pagina"
          title={collapsed ? "Tu página" : undefined}
          className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-grafito/60 hover:bg-arena hover:text-grafito ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <IconPagina className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span className="truncate">Tu página</span>}
        </Link>
        <Link
          href="/perfil"
          title={collapsed ? "Tu perfil" : undefined}
          className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-grafito/60 hover:bg-arena hover:text-grafito ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <IconPerfil className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span className="truncate">Tu perfil</span>}
        </Link>
      </div>
    </aside>
  );
}
