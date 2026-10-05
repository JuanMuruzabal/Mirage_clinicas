import type { TrazoDeFirma } from "@dental-mirage/shared-types";

/** El camino SVG de un trazo: "M x y L x y …". Sirve para los puntos de
 *  una firma ([x, y, ms]) y para los de un dibujo ([x, y]). */
export function caminoDelTrazo(puntos: readonly (readonly [number, number, ...number[]])[]): string {
  if (puntos.length === 0) return "";
  const [primero, ...resto] = puntos;
  // Un toque solo (un punto) se dibuja como un punto, no desaparece.
  if (resto.length === 0) return `M${primero[0]} ${primero[1]} l0.1 0`;
  return `M${primero[0]} ${primero[1]}${resto.map(([x, y]) => ` L${x} ${y}`).join("")}`;
}

// La firma dibujada, redibujada desde sus vectores (TR-184). Es la misma
// que se guardó: no hay una imagen aparte que pueda diferir.
export function TrazoDeFirmaSvg({ trazo, className, titulo }: { trazo: TrazoDeFirma; className?: string; titulo: string }) {
  return (
    <svg
      viewBox={`0 0 ${trazo.ancho} ${trazo.alto}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={titulo}
      className={className}
    >
      {trazo.trazos.map((puntos, i) => (
        <path
          key={i}
          d={caminoDelTrazo(puntos)}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
