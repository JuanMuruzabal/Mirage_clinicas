import Link from "next/link";
import { QuadrantMark } from "./quadrant-mark";

interface NavCardProps {
  href: string;
  eyebrow?: string;
  titulo: string;
  descripcion: string;
  cta?: string;
  size?: "default" | "large";
}

// Tarjeta de navegación con hover que crece un poco. Uso actual: solo
// /seleccionar-servicio (la pantalla post-login) — por eso lleva la
// identidad cálida del panel (TR-013 en docs/tradeoffs.md), no la del
// Sistema Cascarón de la home marketing/pública, que no la usa.
export function NavCard({ href, eyebrow, titulo, descripcion, cta = "Entrar →", size = "default" }: NavCardProps) {
  const big = size === "large";
  return (
    <Link
      href={href}
      className={`group relative flex h-full flex-col gap-3 rounded-card border-[0.5px] border-arena bg-marfil shadow-soft transition-all duration-300 ease-out hover:z-10 hover:scale-[1.02] hover:border-salvia hover:bg-hueso hover:shadow-lg ${big ? "p-10" : "p-8"}`}
    >
      <QuadrantMark className="text-salvia transition-transform duration-300 group-hover:scale-110 group-hover:text-salvia-oscuro" />
      {eyebrow && <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">{eyebrow}</p>}
      <h3
        className={`font-[family-name:var(--font-display)] font-medium text-grafito ${
          big ? "text-3xl" : "text-2xl"
        }`}
      >
        {titulo}
      </h3>
      <p className="text-sm text-grafito/60">{descripcion}</p>
      <span className="mt-2 text-sm font-medium text-salvia-oscuro transition-transform duration-300 group-hover:translate-x-1 group-hover:text-grafito">
        {cta}
      </span>
    </Link>
  );
}
