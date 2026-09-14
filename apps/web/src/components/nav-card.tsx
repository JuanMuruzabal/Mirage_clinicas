import Link from "next/link";
import { QuadrantMark } from "./quadrant-mark";
import { IconArrowRight } from "./icons";

interface NavCardProps {
  href: string;
  eyebrow?: string;
  titulo: string;
  descripcion: string;
  cta?: string;
  size?: "default" | "large";
  /**
   * "principal" cambia la COMPOSICIÓN, no solo el tamaño: la tarjeta pasa
   * a ser horizontal, con el texto a la izquierda y un botón sólido a la
   * derecha. Rediseño del 2026-09-14 — la acción principal ocupa las dos
   * columnas de la grilla, y una tarjeta estirada sin cambiar de
   * composición no justifica su ancho: queda peor que antes de
   * agrandarla.
   */
  variante?: "normal" | "principal";
}

// Tarjeta de navegación. Uso actual: solo /seleccionar-servicio (la
// pantalla post-login) — por eso lleva la identidad cálida del panel
// (TR-013 en docs/Arquitectura y base/tradeoffs.md), no la del Sistema
// Cascarón de la home marketing/pública, que no la usa.
//
// Toda la tarjeta es el enlace, no solo el "Entrar": el objetivo de click
// más grande es el que la persona ya está mirando.
export function NavCard({
  href,
  eyebrow,
  titulo,
  descripcion,
  cta = "Entrar",
  size = "default",
  variante = "normal",
}: NavCardProps) {
  const big = size === "large";

  if (variante === "principal") {
    return (
      <Link
        href={href}
        className="group flex flex-col items-start gap-6 rounded-card border border-linea bg-marfil p-8 shadow-soft transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg sm:flex-row sm:items-center sm:gap-10 sm:p-11"
      >
        <QuadrantMark className="text-salvia transition-transform duration-300 group-hover:scale-110 group-hover:text-salvia-oscuro" />
        <div className="flex flex-col gap-2">
          {eyebrow && (
            <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
              {eyebrow}
            </p>
          )}
          <h3 className="font-[family-name:var(--font-display)] text-[clamp(32px,3.6vw,42px)] font-medium leading-tight text-grafito">
            {titulo}
          </h3>
          <p className="text-[17.5px] text-grafito/60">{descripcion}</p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-salvia-oscuro px-[30px] py-4 text-sm font-semibold text-marfil transition-all duration-300 group-hover:brightness-95 sm:ml-auto">
          {cta}
          <IconArrowRight className="h-4 w-4" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`group relative flex h-full flex-col gap-3 rounded-card border border-linea bg-marfil shadow-soft transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-salvia hover:shadow-lg ${
        big ? "p-10" : "p-8"
      }`}
    >
      <QuadrantMark className="text-salvia transition-transform duration-300 group-hover:scale-110 group-hover:text-salvia-oscuro" />
      {eyebrow && (
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">{eyebrow}</p>
      )}
      <h3
        className={`font-[family-name:var(--font-display)] font-medium text-grafito ${big ? "text-3xl" : "text-2xl"}`}
      >
        {titulo}
      </h3>
      <p className="text-sm text-grafito/60">{descripcion}</p>
      <span className="mt-auto pt-2 text-sm font-medium text-salvia-oscuro transition-transform duration-300 group-hover:translate-x-1 group-hover:text-grafito">
        {cta}
      </span>
    </Link>
  );
}
