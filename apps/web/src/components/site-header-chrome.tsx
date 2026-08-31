"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { QuadrantMark } from "./quadrant-mark";
import { HeaderFrame } from "./header-frame";
import { HeaderConfigMenu } from "./header-config-menu";
import { IconMenu, IconX } from "./icons";
import { isHerramientaRoute, isPanelRoute } from "@/lib/site-routes";
import { navLinkClass } from "@/lib/styles";
import { usePanelSidebar } from "@/lib/panel-sidebar-context";

/**
 * Toda la interactividad del header vive acá (mismo patrón que
 * site-header.tsx de Alojamientos Madryn: el Server Component solo
 * resuelve la sesión y le pasa `estado` — un primitivo serializable — a
 * este Client Component, que es quien de verdad arma el layout y el menú
 * mobile).
 *
 * Corrección post-entrega (2026-08-24, pedido explícito del cliente: "el
 * header cuando se acumulan componentes se ve espantoso [en mobile]...
 * aplicar la misma solucion que alojamientos madryn, aqui con una barra
 * desplegable se ven las opciones del header"). El dropdown de
 * hamburguesa solo hace falta para el estado anónimo (4 accesos:
 * Buscar clínicas/Servicios/Ingresar/Sumate, desbordan una pantalla
 * angosta en una sola fila) — los otros dos estados son un único botón
 * compacto que nunca desborda, así que se muestran igual en mobile y
 * desktop sin necesitar el dropdown (TR-060 en docs/tradeoffs.md).
 *
 * `estado` — TR-058/TR-060 en docs/tradeoffs.md (pedido explícito del
 * cliente, 2026-08-26): con sesión y mail verificado pero onboarding
 * incompleto ("cuentaSinTerminar") o completo ("completo"), el header
 * muestra:
 *   - en una pantalla de herramienta (`isHerramientaRoute` — seleccionar
 *     servicio, panel, perfil, personalizar página) con onboarding YA
 *     completo: el botón de configuración (`HeaderConfigMenu`), acceso
 *     rápido a Perfil/Gestionar tu clínica/Personalizar tu página.
 *   - en cualquier otro caso con sesión (Home, buscador, o una pantalla
 *     de herramienta con el onboarding todavía sin terminar — bloqueada
 *     por el modal de bienvenida): un único botón "Mi clínica" →
 *     /seleccionar-servicio. Antes esto solo pasaba fuera de
 *     /seleccionar-servicio (esa ruta mantenía el header viejo a
 *     propósito) — pedido explícito del cliente, 2026-08-26: "sigue
 *     persistiendo que se ve el header del home por detrás del
 *     formulario... y no el header correspondiente a esa sección" — ya
 *     no hay excepción de ruta para el estado sin terminar.
 *
 * "Volver al inicio" (el link que vivía acá, solo en /seleccionar-
 * servicio) se sacó del todo — TR-061 en docs/tradeoffs.md, pedido
 * explícito del cliente, 2026-08-26: con el logo ya yendo siempre a "/"
 * (ver más abajo), era redundante. `volver-al-inicio-link.tsx` queda sin
 * usar y se borró junto con esto.
 */
export type EstadoHeaderSesion = "anonimo" | "cuentaSinTerminar" | "completo";

export function SiteHeaderChrome({ estado }: { estado: EstadoHeaderSesion }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const panelSidebar = usePanelSidebar();

  const esHerramienta = estado === "completo" && isHerramientaRoute(pathname);
  const enRutaConSidebar = isPanelRoute(pathname);
  // mostrarGear — corrección de QA (2026-09-05, textual): "saque del
  // header del panel de gestion de clinica la tuerquita de opciones, ya
  // que en el sidebar da las opciones" — en /panel/** el sidebar YA
  // ofrece "Tu página"/"Tu perfil" (ver panel-sidebar.tsx) y "Cerrar
  // sesión" sigue alcanzable desde /perfil (mismo criterio que dejó
  // TR-075 ahí), así que el gear queda redundante ahí — se saca SOLO en
  // rutas con sidebar; /perfil, /personalizar-pagina y
  // /seleccionar-servicio (sin sidebar propio) lo siguen mostrando, es
  // su único acceso a esas dos opciones. Antes `mostrarGear` y
  // `esHerramienta` eran la misma condición — separados para poder
  // sacar el gear sin tocar `ocultarLogo`/`enRutaConSidebar`, que siguen
  // dependiendo de "es una pantalla de herramienta" en general, no de
  // "tiene gear".
  const mostrarGear = esHerramienta && !enRutaConSidebar;
  const mostrarMiClinica = estado !== "anonimo" && !esHerramienta;
  const mostrarAccesosAnonimos = estado === "anonimo";

  // TR-075 en docs/tradeoffs.md (2026-08-27, pedido explícito del
  // cliente: "quitar de aquí el logo de Dental Mirage que te lleva a la
  // home... solo en la página de /seleccionar-servicio debe ser visible
  // el ícono para volver al home"). De las 4 pantallas de herramienta
  // (`esHerramienta` de arriba), solo /seleccionar-servicio conserva
  // el logo — en las otras 3 (/panel/**, /perfil, /personalizar-pagina)
  // el logo desaparece: en /panel/** en mobile lo reemplaza el ícono de
  // hamburguesa (abre el sidebar), y en el resto de los casos (desktop
  // de /panel/**, y las dos pantallas sin sidebar en cualquier ancho) lo
  // reemplaza un botón "Panel" que vuelve a /seleccionar-servicio.
  const esSeleccionarServicio = pathname === "/seleccionar-servicio";
  const ocultarLogo = esHerramienta && !esSeleccionarServicio;

  // Mismo patrón que Alojamientos Madryn (site-header.tsx) para cerrar el
  // menú al navegar: "adjusting state when a prop changes"
  // (https://react.dev/learn/you-might-not-need-an-effect) en vez de un
  // useEffect con un setState síncrono — comparar contra un estado propio
  // y llamar setState DIRECTO en el cuerpo del render es el patrón que
  // React avala para esto.
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (pathname !== menuPathname) {
    setMenuPathname(pathname);
    setMenuOpen(false);
  }

  function toggleMenu() {
    setMenuOpen((open) => !open);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  const mobileLinkClass =
    "rounded-field px-3 py-2.5 text-sm font-medium text-current transition-colors hover:bg-current/10";
  const pillLinkClass =
    "rounded-full bg-salvia-oscuro px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-marfil hover:brightness-95";

  // TR-065 en docs/tradeoffs.md (pedido explícito del cliente,
  // 2026-08-26): "en desktop hay un gap en la esquina superior derecha,
  // el header... no llega hasta el borde derecho del área de
  // contenido". Causa real: la fila del header centra su contenido en
  // `max-w-5xl` respecto al VIEWPORT completo, pero /panel tiene un
  // sidebar propio a la izquierda — el contenido de cada página de panel
  // no está centrado en el viewport, ocupa todo el ancho a la derecha
  // del sidebar con `p-8` (2rem). En pantallas anchas esos dos "centros"
  // no coinciden y el header queda corto del borde real del contenido.
  // Para /panel (el único layout con sidebar) el header pasa a ancho
  // completo con el MISMO padding horizontal (`px-8`) que ya usa el
  // contenido de esas páginas, en vez de centrarse — así sus bordes
  // quedan alineados de verdad. El resto del sitio (sin sidebar, spec
  // §9.7) no cambia.
  const contenedorClass = isPanelRoute(pathname)
    ? "flex w-full items-center justify-between px-8 py-4"
    : "mx-auto flex max-w-5xl items-center justify-between px-6 py-4";

  return (
    <HeaderFrame forceSolid={menuOpen}>
      <div className={contenedorClass}>
        <div className="flex items-center gap-4">
          {ocultarLogo ? (
            <>
              {/* Mobile en una ruta con sidebar (/panel/**): hamburguesa
                  que abre el drawer (TR-075), en vez del botón "Panel" —
                  ahí ya existe otra forma de llegar a /seleccionar-
                  servicio (el ítem "Panel" agregado adentro del propio
                  sidebar), así que este espacio se dedica a lo que
                  realmente hace falta en esa pantalla puntual. Ícono
                  alternado con el drawer (corrección de QA, 2026-09-05,
                  textual): "cuando tengo desplegado el sidebar cambiar
                  las tres rayitas con una x cuando esta abierto, y
                  cuando se cierra vuelven las rayitas". */}
              {enRutaConSidebar && (
                <button
                  type="button"
                  onClick={panelSidebar.toggle}
                  aria-expanded={panelSidebar.open}
                  aria-controls="panel-sidebar-drawer"
                  aria-label={panelSidebar.open ? "Cerrar menú" : "Abrir menú"}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-current md:hidden"
                >
                  {panelSidebar.open ? <IconX className="h-6 w-6" /> : <IconMenu className="h-6 w-6" />}
                </button>
              )}
              {/* Botón "Panel" → /seleccionar-servicio: siempre en
                  desktop; en mobile, solo en las 2 pantallas de
                  herramienta SIN sidebar (/perfil, /personalizar-pagina)
                  — en /panel/** ese lugar lo ocupa la hamburguesa de
                  arriba. */}
              <Link
                href="/seleccionar-servicio"
                onClick={closeMenu}
                className={`flex items-center gap-2 text-current ${enRutaConSidebar ? "hidden md:flex" : ""}`}
              >
                <QuadrantMark className="text-steel" />
                <span className="text-sm font-semibold">Panel</span>
              </Link>
            </>
          ) : (
            /* El logo siempre vuelve a la home pública, tenga sesión o no
               (pedido explícito del cliente, 2026-08-26) — antes llevaba a
               /seleccionar-servicio con onboarding completo. */
            <Link href="/" className="flex items-center gap-2 text-current" onClick={closeMenu}>
              <QuadrantMark className="text-steel" />
              <span className="font-[family-name:var(--font-display)] text-lg font-black uppercase tracking-tight">
                Dental Mirage
              </span>
            </Link>
          )}
        </div>

        {/* Accesos directos a información dentro del Home (anclas, no
            rutas propias) — son para un VISITANTE sin cuenta todavía. Solo
            desktop: en mobile viven en el dropdown de abajo. */}
        {mostrarAccesosAnonimos && (
          <nav aria-label="Accesos directos" className="hidden items-center gap-7 md:flex">
            <Link href="/#buscar" className={navLinkClass}>
              Buscar clínicas
            </Link>
            <Link href="/#como-funciona" className={navLinkClass}>
              Servicios para profesionales
            </Link>
          </nav>
        )}

        {mostrarGear && <HeaderConfigMenu />}

        {mostrarMiClinica && (
          <Link href="/seleccionar-servicio" className={pillLinkClass}>
            Mi clínica
          </Link>
        )}

        {mostrarAccesosAnonimos && (
          <>
            <nav className="hidden items-center gap-6 md:flex">
              <Link href="/ingresar" className={navLinkClass}>
                Ingresar
              </Link>
              <Link href="/sumarse" className={pillLinkClass}>
                Sumate
              </Link>
            </nav>

            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="menu-mobile-header"
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              onClick={toggleMenu}
              className="flex h-10 w-10 flex-shrink-0 flex-col items-center justify-center gap-1.5 md:hidden"
            >
              <span
                className={`h-px w-5 bg-current transition-transform duration-200 ${
                  menuOpen ? "translate-y-[3.5px] rotate-45" : ""
                }`}
              />
              <span
                className={`h-px w-5 bg-current transition-transform duration-200 ${
                  menuOpen ? "-translate-y-[3.5px] -rotate-45" : ""
                }`}
              />
            </button>
          </>
        )}
      </div>

      {menuOpen && mostrarAccesosAnonimos && (
        <nav
          id="menu-mobile-header"
          aria-label="Menú y accesos directos"
          className="flex flex-col gap-1 border-t border-current/15 px-6 py-4 text-current md:hidden"
        >
          <Link href="/#buscar" onClick={closeMenu} className={mobileLinkClass}>
            Buscar clínicas
          </Link>
          <Link href="/#como-funciona" onClick={closeMenu} className={mobileLinkClass}>
            Servicios para profesionales
          </Link>
          <Link href="/ingresar" onClick={closeMenu} className={mobileLinkClass}>
            Ingresar
          </Link>
          <Link href="/sumarse" onClick={closeMenu} className={`mt-1 text-center ${pillLinkClass}`}>
            Sumate
          </Link>
        </nav>
      )}
    </HeaderFrame>
  );
}
