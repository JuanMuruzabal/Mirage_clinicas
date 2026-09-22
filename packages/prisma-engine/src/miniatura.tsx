import type { BloqueMiniatura, VarianteModulo } from "./tipos";

// Miniatura esquemática de una variante (PE-3): un solo dibujo para todas,
// a partir de los bloques que declara cada meta.ts (o portada.ts). Colores del
// PANEL (no del tema de la página): es un control del editor.
const RELLENO: Record<BloqueMiniatura[4], string> = {
  titulo: "var(--color-grafito)",
  texto: "color-mix(in srgb, var(--color-grafito) 35%, transparent)",
  foto: "var(--color-salvia-claro)",
  tarjeta: "var(--color-hueso)",
  acento: "var(--color-salvia)",
};

export function Miniatura({ variante }: { variante: VarianteModulo }) {
  return (
    <svg viewBox="0 0 100 60" aria-hidden="true" className="h-auto w-full rounded-field border border-linea bg-marfil">
      {variante.bloques.map(([x, y, w, h, tipo], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx={tipo === "acento" ? h / 2 : 1.5} fill={RELLENO[tipo]} />
      ))}
    </svg>
  );
}
