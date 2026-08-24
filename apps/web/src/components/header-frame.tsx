"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Header transparente sobre la primera foto del Home, sólido en el resto
// (pedido explícito: "como Turismo Marcuzzi, que se adapte al fondo si
// está por encima de la primera imagen"). `fixed` (no `sticky`): para que
// la foto del hero pueda ir de punta a punta detrás del header, este tiene
// que salir del flujo normal — cada página sin foto debajo compensa con
// `pt-[var(--header-height)]` en su <main> (ver globals.css).
export function HeaderFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Solo el Home arranca con una foto a pantalla completa detrás del
  // header — el resto de las páginas no tiene "fondo" que respetar.
  const hasHero = pathname === "/";
  // Piel cálida (TR-013/TR-015 en docs/tradeoffs.md): identidad por
  // defecto de todo el sitio — el topbar usa la paleta nueva
  // (marfil/grafito/arena) en cualquier ruta salvo la home pública, que
  // conserva porcelain/ink sobre su primera foto (pedido explícito del
  // cliente, 2026-08-23: "el home solo cambiar las tarjetas y botones" —
  // el header/hero de esa página no entra). Este mismo header físico se
  // reusa en todas las rutas, así que la única forma de acotarlo sin
  // duplicar el componente es este chequeo de pathname, igual criterio
  // que ya usa `hasHero` acá arriba (de hecho son complementarios: solo el
  // Home tiene hero, así que "no es el Home" alcanza).
  const pielCalida = !hasHero;
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!hasHero) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasHero]);

  // Mide la altura REAL del header y la expone en --header-height (spec
  // §9.7: "header fijo con altura medida dinámicamente") — el valor fijo
  // de globals.css es solo el arranque antes de que esto corra. Sin esto,
  // cualquier desajuste entre ese valor fijo y el alto real del contenido
  // deja un hueco visible entre el header y lo que viene debajo — el bug
  // que se veía en el sidebar de /panel (2026-08-23).
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const actualizarAltura = () => {
      document.documentElement.style.setProperty("--header-height", `${el.offsetHeight}px`);
    };
    actualizarAltura();
    const observer = new ResizeObserver(actualizarAltura);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const solid = !hasHero || scrolled;

  const solidClass = pielCalida ? "border-arena bg-marfil text-grafito" : "border-line bg-porcelain text-ink";

  return (
    <header
      ref={headerRef}
      className={`fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300 ${
        solid ? solidClass : "border-transparent bg-transparent text-porcelain"
      }`}
    >
      {children}
    </header>
  );
}
