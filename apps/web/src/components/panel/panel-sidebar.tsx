"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconCalendario, IconGeneral, IconPacientes, IconPagina, IconPerfil, IconSeguridad, IconTurnos } from "./sidebar-icons";
import { QuadrantMark } from "../quadrant-mark";
import { usePanelSidebar } from "@/lib/panel-sidebar-context";

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
// Reestructurado a drawer en mobile (TR-075 en docs/tradeoffs.md,
// 2026-08-27, pedido explícito del cliente: "restructurar como se ve el
// apartado gestión de clínica [en mobile], el sidebar debe ser
// desplegable desde el header... esto dará más espacio en la pantalla").
// Reemplaza el criterio anterior de TR-025/034 (un único riel de íconos
// de 52px, siempre visible, arrancando colapsado en mobile) — el
// concepto de "colapsado" (`collapsed`, abajo) queda como una
// preferencia SOLO de escritorio; en mobile el sidebar es binario:
// cerrado (fuera de pantalla del todo, `usePanelSidebar().open` en
// false, el estado por default) o abierto como un panel superpuesto de
// ancho completo (240px) sobre el contenido, con fondo oscuro detrás
// (`<div>` de backdrop) — nunca la versión "icono solo" de 52px, que en
// mobile no tenía sentido tocar con el dedo. Se abre/cierra desde el
// ícono de hamburguesa del header (`site-header-chrome.tsx`), que vive
// en otra rama del árbol — de ahí el контext compartido en
// `lib/panel-sidebar-context.tsx` en vez de estado local.
//
// `collapsed` (desktop) sigue siendo la única señal para ESE modo (sin
// variante mobile aparte — el cliente prefiere el control manual de
// siempre, la flechita, sobre un riel forzado por viewport, TR-025) —
// pasa de w-16 (64px) a 52px exactos con los íconos centrados (TR-029).
export function PanelSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { open, close } = usePanelSidebar();

  // Cerrar el drawer mobile al cambiar de ruta (clickear un link de acá
  // adentro, o navegar por cualquier otro medio) — "adjusting state when
  // a prop changes" (https://react.dev/learn/you-might-not-need-an-effect),
  // mismo patrón ya usado en site-header-chrome.tsx para el menú mobile
  // anónimo, en vez de un useEffect con setState síncrono.
  const [sidebarPathname, setSidebarPathname] = useState(pathname);
  if (pathname !== sidebarPathname) {
    setSidebarPathname(pathname);
    if (open) close();
  }

  return (
    <>
      {/* Backdrop — solo mobile, solo con el drawer abierto. Clickearlo
          cierra, mismo criterio que cualquier modal de la app
          (ModalPortal). Empieza debajo del header (`top-[var(--header-
          height)]`, no `inset-0`) — pedido explícito del cliente,
          2026-08-27: "se debería desplegar de altura sin sobrepasar el
          header" — así el header (con el ícono de hamburguesa) queda
          SIEMPRE visible y clickeable para cerrar, no tapado por el
          oscurecido. z-40: mismo nivel que tenía antes, por detrás del
          drawer (z-50). */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 top-[var(--header-height)] z-40 bg-grafito/50 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* .panel-sidebar-h (TR-029 en docs/tradeoffs.md): declara el
          mismo alto dos veces (`vh` de base, `dvh` encima bajo
          `@supports`) para el caso de escritorio (`sticky`, alto =
          viewport menos el header) — se mantiene sin cambios ahí.
          `max-md:h-auto!` (TR-075) anula esa altura fija SOLO en mobile
          con `!important` (no reordenando reglas — la clase de
          globals.css y esta viven en archivos distintos, forzar el
          orden de compilado es frágil, ver TR-029/034 en este mismo
          historial). El drawer mobile arranca en `top-[var(--header-
          height)]` (no `inset-y-0`/top:0 — pedido explícito del
          cliente, 2026-08-27: "el sidebar... se debería desplegar de
          altura sin sobrepasar el header") hasta el borde inferior de
          la pantalla (`bottom-0`) — antes tapaba también al header
          (incluido su propio ícono de hamburguesa), lo que además hacía
          imposible tocarlo de nuevo para cerrar el drawer sin recurrir
          al backdrop. `height: auto` deja que `top`/`bottom` sean los
          que definan el alto real, no un `calc()` pensado para la
          versión `sticky` de escritorio. */}
      <aside
        id="panel-sidebar-drawer"
        className={`panel-sidebar-h max-md:h-auto! fixed left-0 top-[var(--header-height)] bottom-0 z-50 flex w-60 flex-shrink-0 flex-col border-r-[0.5px] border-arena bg-marfil transition-transform duration-300 md:sticky md:inset-y-auto md:top-[var(--header-height)] md:z-auto md:h-[calc(100vh-var(--header-height))] md:translate-x-0 md:transition-[width] ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-[52px]" : "md:w-60"}`}
      >
        {/* Retraer/expandir — solo escritorio (TR-075): en mobile el
            sidebar es binario (abierto/cerrado desde la hamburguesa del
            header), este control de "icono solo" no aplica ahí. */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expandir menú" : "Retraer menú"}
          aria-expanded={!collapsed}
          className="hidden items-center justify-center border-b-[0.5px] border-arena py-3 text-grafito/50 hover:text-grafito md:flex"
        >
          <span aria-hidden="true" className={`inline-block transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}>
            ←
          </span>
        </button>

        {/* "Panel" → /seleccionar-servicio (TR-075 en docs/tradeoffs.md,
            pedido explícito del cliente: "agregar la opción para volver
            a seleccionar servicio, con un botón que diga panel") — el
            mismo ícono (QuadrantMark) que usaba el logo que se sacó del
            header en esta pantalla, ahora sirve de acceso para volver al
            centro de servicios en vez de a la home pública. Separado del
            resto de la navegación con su propio borde: no es una sección
            de ESTA clínica, es "salir" a elegir otro servicio.

            Solo mobile (TR-077 en docs/tradeoffs.md, 2026-08-27, pedido
            explícito del cliente: "en la versión de escritorio no
            debería ver la opción de Panel en el sidebar") — en
            escritorio ese mismo destino ya está en el header (el botón
            "Panel" que reemplaza al logo, ver site-header-chrome.tsx),
            tenerlo accá también era redundante. En mobile sigue haciendo
            falta: el header ahí muestra la hamburguesa, no el botón
            "Panel". */}
        <div className="border-b-[0.5px] border-arena p-3 md:hidden">
          <Link
            href="/seleccionar-servicio"
            title={collapsed ? "Panel" : undefined}
            className={`flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-medium text-grafito transition-colors hover:bg-arena ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <QuadrantMark className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">Panel</span>}
          </Link>
        </div>

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
          {/* Seguridad (corrección de seguridad, Fase 2.4.1) — mails/IPs
              que el sistema bloqueó solo por abuso del formulario
              público, más la auditoría de qué se borró. Uso ocasional
              ("por las dudas de algún malentendido"), no un flujo diario
              — por eso vive acá abajo, junto a Tu página/Tu perfil, no en
              la navegación principal de arriba. */}
          <Link
            href="/panel/seguridad"
            title={collapsed ? "Seguridad" : undefined}
            className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-grafito/60 hover:bg-arena hover:text-grafito ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <IconSeguridad className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span className="truncate">Seguridad</span>}
          </Link>
        </div>
      </aside>
    </>
  );
}
