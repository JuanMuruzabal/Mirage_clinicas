import { QuadrantMark } from "./quadrant-mark";

interface InfoCardProps {
  eyebrow?: string;
  titulo: string;
  descripcion: string;
}

// Tarjeta puramente informativa (no navega a ningún lado — pedido
// explícito) — sin <Link>, sin hover de "clic acá". Semiopaca con blur
// ("vidrio") a propósito: vive encima de una foto de fondo, no de un
// color plano — sin el blur, el detalle de la foto por debajo compite con
// el texto y se lee peor. Identidad cálida (TR-015 en docs/tradeoffs.md,
// pedido explícito del cliente: "el home solo cambiar las tarjetas y
// botones") — `marfil` en vez de `porcelain`, mismo tono casi blanco
// (#FFFDF9 vs #F4F6F5), sigue legible sobre la foto sin romper el vidrio.
export function InfoCard({ eyebrow, titulo, descripcion }: InfoCardProps) {
  return (
    <div className="relative flex h-full flex-col gap-3 rounded-card border border-marfil/30 bg-marfil/15 p-8 backdrop-blur-sm">
      <QuadrantMark className="text-marfil/40" />
      {eyebrow && (
        <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-marfil/60">{eyebrow}</p>
      )}
      {/* Tipografía condensada de alto contraste sin tocar (uppercase +
          font-black) — es contenido de marketing sobre una foto, no una
          herramienta de uso diario; TR-013 solo suaviza esa tipografía
          dentro del panel de gestión. Acá el pedido del cliente fue de
          color, no de peso tipográfico. */}
      <h3 className="font-[family-name:var(--font-display)] text-2xl font-extrabold uppercase tracking-tight text-marfil">
        {titulo}
      </h3>
      <p className="text-sm text-marfil/75">{descripcion}</p>
    </div>
  );
}
