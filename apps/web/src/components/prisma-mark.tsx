import { usePinturaPrismatica } from "@/components/panel/degrade-prismatico";

// MARCA DE PRISMA (correcciones generales, ítem 1, 2026-10-10, pedido de la
// persona: el ícono principal de la app "pasa a ser un prisma"). Reemplaza a
// la grilla de cuatro cuadraditos (`QuadrantMark`) donde funcionaba como
// LOGO —el header, el ítem "Panel" del sidebar, las tarjetas de /clinicas y
// de "¿Qué necesitás hoy?"—. `QuadrantMark` sigue donde dice algo (el estado
// de un turno en las tablas) y en la página pública de las clínicas.
//
// Un prisma de línea, con el mismo trazo de esquinas duras que los íconos
// del panel: el triángulo y la arista de la cara de adelante, en el color
// del texto (`currentColor`). La arista derecha lleva un brillo del degradé
// prismático apagado (`usePinturaPrismatica`), discreto: es la luz que el
// prisma descompone. Mide 1em, como la marca anterior, así que donde se
// usaba no hay que tocar tamaños.
export function PrismaMark({ className = "" }: { className?: string }) {
  // Quieto (sin `dibujo-prismatico`): el logo está siempre en pantalla.
  const pintura = usePinturaPrismatica(24, 24);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`inline-block h-[1em] w-[1em] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="miter"
      strokeLinecap="square"
    >
      {pintura.defs}
      <path d="M12 3 L21.5 20 L2.5 20 Z" />
      <path d="M12 3 L14.6 20" />
      <path d="M12.6 4.2 L20.4 18.2" stroke={pintura.url} strokeOpacity={0.85} strokeWidth={1.2} />
    </svg>
  );
}
