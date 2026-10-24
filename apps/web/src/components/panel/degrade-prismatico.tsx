import { useId } from "react";

// DEGRADÉ PRISMÁTICO (correcciones generales, ítem 1, 2026-10-10, guía de
// estilo de la persona: "los dibujos de la tarjeta general, como los nuevos
// a venir, tienen que estar dibujados con una mezcla de colores, como los
// colores de la subclase prismática de Destiny 2, también con movimiento").
//
// Deja un `<linearGradient>` iridiscente y apagado —magenta, violeta, azul,
// cian y dorado, los `--prisma-*` de globals.css—. El movimiento no lo pone
// el degradé sino el `<svg>` que lo usa, con la clase `dibujo-prismatico`
// (globals.css): un `hue-rotate` lento que hace correr los colores. Animar
// las paradas repintaba el SVG en cada cuadro y costaba el doble de GPU.
// Con "reducir movimiento", quieto.
//
// Uso, dentro de un `<svg>`:
//
//   const pintura = usePinturaPrismatica(ancho, alto); // las del viewBox
//   <svg className="dibujo-prismatico ..." ...>   // con movimiento
//     {pintura.defs}
//     <path stroke={pintura.url} />
//     <rect fill={pintura.url} fillOpacity={0.3} />
//   </svg>
//
// El id sale de `useId`, así varios dibujos en la misma pantalla no se pisan.
// El degradé va en coordenadas del dibujo (`userSpaceOnUse`) sobre el
// `viewBox` que se le pase, en diagonal: todas las piezas de un mismo dibujo
// comparten el mismo arcoíris en vez de repetirlo cada una.

const PARADAS = [
  "var(--prisma-magenta)",
  "var(--prisma-violeta)",
  "var(--prisma-azul)",
  "var(--prisma-cian)",
  "var(--prisma-dorado)",
];

interface DegradePrismaticoProps {
  id: string;
  ancho?: number;
  alto?: number;
  /** Dónde arranca el degradé, para un dibujo cuyo `viewBox` no empieza en 0
   *  (las viñetas de las escenas de los encabezados). */
  x0?: number;
  y0?: number;
  /** Cuántas veces recorre el arco el dibujo: con más de una, el degradé se
   *  acorta y sigue en espejo, así un dibujo grande muestra más colores a la
   *  vez (las escenas de /seleccionar-servicio, 2026-10-19). */
  vueltas?: number;
}

export function DegradePrismatico({ id, ancho = 100, alto = 100, x0 = 0, y0 = 0, vueltas = 1 }: DegradePrismaticoProps) {
  return (
    <defs>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={x0}
        y1={y0}
        x2={x0 + ancho / vueltas}
        y2={y0 + alto / vueltas}
        spreadMethod={vueltas > 1 ? "reflect" : undefined}
      >
        {PARADAS.map((color, n) => (
          <stop
            key={n}
            offset={`${(n / (PARADAS.length - 1)) * 100}%`}
            style={{ stopColor: color }}
          />
        ))}
      </linearGradient>
    </defs>
  );
}

export function usePinturaPrismatica(ancho = 100, alto = 100, x0 = 0, y0 = 0, vueltas = 1) {
  // Los ":" de useId son válidos en un id, pero dentro de `url(#…)` se leen
  // como sintaxis de CSS: se sacan.
  const id = `prisma-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return {
    id,
    url: `url(#${id})`,
    defs: <DegradePrismatico id={id} ancho={ancho} alto={alto} x0={x0} y0={y0} vueltas={vueltas} />,
  };
}
