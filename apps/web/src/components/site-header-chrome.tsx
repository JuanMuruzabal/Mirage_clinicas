"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { QuadrantMark } from "./quadrant-mark";
import { HeaderFrame } from "./header-frame";
import { VolverAlInicioLink } from "./volver-al-inicio-link";
import { navLinkClass } from "@/lib/styles";

/**
 * Toda la interactividad del header vive acá (mismo patrón que
 * site-header.tsx de Alojamientos Madryn: el Server Component solo
 * resuelve la sesión y le pasa `estado`/`brandHref` — dos primitivos
 * serializables — a este Client Component, que es quien de verdad arma
 * el layout y el menú mobile).
 *
 * Corrección post-entrega (2026-08-24, pedido explícito del cliente: "el
 * header cuando se acumulan componentes se ve espantoso [en mobile]...
 * aplicar la misma solucion que alojamientos madryn, aqui con una barra
 * desplegable se ven las opciones del header"). Antes de esto, la fila
 * superior mostraba SIEMPRE los tres links de sesión ("Gestionar tu
 * clínica"/"Editar tu página"/"Tu perfil") o "Ingresar"/"Sumate" en la
 * misma línea que el logo — en una pantalla angosta eso desborda o se
 * amontona. Ahora, debajo de `md`, la fila superior queda solo con el
 * logo + un botón de hamburguesa; todo lo demás se mueve a un dropdown
 * que se abre debajo del header (mismo criterio visual que Alojamientos
 * Madryn: dos líneas que rotan a una X, dropdown con `border-t`).
 *
 * `estado` — TR-058 en docs/tradeoffs.md (pedido explícito del cliente,
 * 2026-08-26): antes esto era un booleano `loggedIn` (onboarding completo
 * sí/no). Ahora hay un tercer estado intermedio, cuenta creada y mail
 * verificado pero perfil/clínica todavía sin terminar — ese estado
 * muestra un único link "Tu clínica" (→ /seleccionar-servicio) en vez de
 * los tres links de herramientas o de "Ingresar"/"Sumate", EXCEPTO en la
 * propia /seleccionar-servicio, donde el header debe quedar EXACTAMENTE
 * como estaba ("el header de seleccionar servicio debe quedar como
 * esta") — de ahí el chequeo de `pathname` acá, no en el Server
 * Component (que no tiene acceso a la ruta actual).
 */
export type EstadoHeaderSesion = "anonimo" | "cuentaSinTerminar" | "completo";

export function SiteHeaderChrome({ estado, brandHref }: { estado: EstadoHeaderSesion; brandHref: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const enSeleccionarServicio = pathname === "/seleccionar-servicio";
  const mostrarNavCompleta = estado === "completo";
  const mostrarTuClinica = estado === "cuentaSinTerminar" && !enSeleccionarServicio;
  const mostrarAccesosAnonimos = !mostrarNavCompleta && !mostrarTuClinica;

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

  return (
    <HeaderFrame forceSolid={menuOpen}>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          {mostrarNavCompleta && (
            <div className="hidden md:block">
              <VolverAlInicioLink />
            </div>
          )}
          <Link href={brandHref} className="flex items-center gap-2 text-current" onClick={closeMenu}>
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

        <nav className="hidden items-center gap-6 md:flex">
          {mostrarNavCompleta ? (
            <>
              <Link href="/panel" className={navLinkClass}>
                Gestionar tu clínica
              </Link>
              <Link href="/personalizar-pagina" className={navLinkClass}>
                Editar tu página
              </Link>
              <Link href="/perfil" className={navLinkClass}>
                Tu perfil
              </Link>
            </>
          ) : mostrarTuClinica ? (
            <Link
              href="/seleccionar-servicio"
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-marfil hover:brightness-95"
            >
              Tu clínica
            </Link>
          ) : (
            <>
              <Link href="/ingresar" className={navLinkClass}>
                Ingresar
              </Link>
              <Link
                href="/sumarse"
                className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-marfil hover:brightness-95"
              >
                Sumate
              </Link>
            </>
          )}
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
      </div>

      {menuOpen && (
        <nav
          id="menu-mobile-header"
          aria-label={mostrarAccesosAnonimos ? "Menú y accesos directos" : "Menú"}
          className="flex flex-col gap-1 border-t border-current/15 px-6 py-4 text-current md:hidden"
        >
          {mostrarNavCompleta ? (
            <>
              <div onClick={closeMenu}>
                <VolverAlInicioLink />
              </div>
              <Link href="/panel" onClick={closeMenu} className={mobileLinkClass}>
                Gestionar tu clínica
              </Link>
              <Link href="/personalizar-pagina" onClick={closeMenu} className={mobileLinkClass}>
                Editar tu página
              </Link>
              <Link href="/perfil" onClick={closeMenu} className={mobileLinkClass}>
                Tu perfil
              </Link>
            </>
          ) : mostrarTuClinica ? (
            <Link
              href="/seleccionar-servicio"
              onClick={closeMenu}
              className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-marfil hover:brightness-95"
            >
              Tu clínica
            </Link>
          ) : (
            <>
              <Link href="/#buscar" onClick={closeMenu} className={mobileLinkClass}>
                Buscar clínicas
              </Link>
              <Link href="/#como-funciona" onClick={closeMenu} className={mobileLinkClass}>
                Servicios para profesionales
              </Link>
              <Link href="/ingresar" onClick={closeMenu} className={mobileLinkClass}>
                Ingresar
              </Link>
              <Link
                href="/sumarse"
                onClick={closeMenu}
                className="mt-1 rounded-full bg-salvia-oscuro px-5 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-marfil hover:brightness-95"
              >
                Sumate
              </Link>
            </>
          )}
        </nav>
      )}
    </HeaderFrame>
  );
}
