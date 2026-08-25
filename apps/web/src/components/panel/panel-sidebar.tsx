"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconCalendario, IconGeneral, IconPacientes, IconPagina, IconPerfil, IconTurnos } from "./sidebar-icons";
import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";

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
//
// Décima vuelta (2026-08-24 — ver TR-033 en docs/tradeoffs.md): `top-0`
// en mobile en vez de heredar siempre `top-[var(--header-height)]`. Ese
// offset tenía sentido en escritorio, donde es el DOCUMENTO el que
// scrollea y el sidebar necesita saber cuánto "header" hay que dejar
// libre antes de pegarse. En mobile, desde TR-026, el documento no
// scrollea más — la raíz de /panel (`PanelShell`) ya reserva ese mismo
// espacio con `padding-top: var(--header-height)` — así que el offset de
// `sticky` quedaba sumándose una SEGUNDA vez sobre ese padding (el
// sidebar aparecía un tramo de header-height más abajo de lo debido,
// dejando una franja vacía entre el header y los íconos — justo el "gap"
// reportado por el cliente). `top-0` en mobile deja que el sidebar se
// pegue apenas se lo tapa desde el borde de su propio contenedor (que ya
// arranca después del padding) — sin volver a compensar nada.
export function PanelSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Arranca colapsado en mobile (undécima corrección, 2026-08-24 — ver
  // TR-034 en docs/tradeoffs.md, pedido explícito del cliente: "en mobile
  // que la primera vista de la pagina el sidebar este contraido no
  // desplegado"). No se puede decidir esto en el `useState` inicial de
  // forma directa — el mismo inicializador corre en el servidor (SSR, sin
  // `window`) y en el cliente durante la hidratación, y si diera
  // resultados distintos ahí sería un mismatch de hidratación. En cambio,
  // `useIsomorphicLayoutEffect` (client-only) corre una vez al montar,
  // ANTES de que el navegador pinte — así el ajuste nunca se llega a ver
  // como un parpadeo (arranca expandido solo en el HTML del servidor, que
  // nadie ve renderizado tal cual en mobile). Sin deps: solo la primera
  // vista, no hace falta reaccionar a cada resize de la ventana.
  useIsomorphicLayoutEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setCollapsed(true);
    }
  }, []);

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
      className={`panel-sidebar-h sticky top-[var(--header-height)] max-md:top-0 flex h-[calc(100vh-var(--header-height))] flex-shrink-0 flex-col border-r-[0.5px] border-arena bg-marfil transition-[width] duration-300 ${
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
