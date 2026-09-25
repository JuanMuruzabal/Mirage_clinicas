import type { BloqueMiniatura, DefinicionModulo, VarianteModulo } from "./tipos";

// Para un módulo sin variantes ni miniatura propia: un título y dos líneas.
const MINIATURA_GENERICA: BloqueMiniatura[] = [[25, 10, 50, 7, "titulo"], [15, 24, 70, 4, "texto"], [20, 32, 60, 4, "texto"]];

/**
 * Lo que dibuja el catálogo de "Agregar sección" para un módulo (PP-6, H20):
 * la variante pedida (la de una sección prearmada), si no la primera, y si el
 * módulo no tiene variantes, su `miniatura`.
 */
export function miniaturaDeModulo(definicion: DefinicionModulo, varianteId?: string): VarianteModulo {
  const variante = definicion.variantes.find((v) => v.id === varianteId) ?? definicion.variantes[0];
  if (variante) return variante;
  return { id: definicion.tipo, nombre: definicion.nombre, bloques: definicion.miniatura ?? MINIATURA_GENERICA };
}

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
