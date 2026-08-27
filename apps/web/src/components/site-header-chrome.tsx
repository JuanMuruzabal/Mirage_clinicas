"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { QuadrantMark } from "./quadrant-mark";
import { HeaderFrame } from "./header-frame";
import { HeaderConfigMenu } from "./header-config-menu";
import { isHerramientaRoute, isPanelRoute } from "@/lib/site-routes";
import { navLinkClass } from "@/lib/styles";

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

  const mostrarGear = estado === "completo" && isHerramientaRoute(pathname);
  const mostrarMiClinica = estado !== "anonimo" && !mostrarGear;
  const mostrarAccesosAnonimos = estado === "anonimo";

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
          {/* El logo siempre vuelve a la home pública, tenga sesión o no
              (pedido explícito del cliente, 2026-08-26) — antes llevaba a
              /seleccionar-servicio con onboarding completo. */}
          <Link href="/" className="flex items-center gap-2 text-current" onClick={closeMenu}>
            <QuadrantMark className="text-steel" />
            <span className="font-[family-name:var(--font-display)] text-lg font-black uppercase tracking-tight">
              Dental Mirage
            </span>
          </Link>
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
