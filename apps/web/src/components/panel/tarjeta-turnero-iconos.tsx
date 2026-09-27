import type { CSSProperties } from "react";

interface IconoDecorativoProps {
  className?: string;
}

// Los dibujos de fondo de las tarjetas de General — segunda versión
// (2026-09-26, pedido del cliente: "mejorar los dibujos de las tarjetas").
//
// La primera versión eran íconos sueltos (un reloj, tres chevrones, un
// círculo con un signo más) que no se leían como un juego ni decían mucho
// de lo que cuenta cada tarjeta. Estos siguen las mismas reglas entre sí:
//
//   - el mismo trazo (3 sobre 100) con esquinas duras, como la marca de
//     cuadrante de PRISMA (spec §9.7);
//   - una pieza RELLENA por dibujo, que es la que cuenta la historia (la
//     mañana que ya pasó, el turno del día que viene, los horarios
//     tomados, la arena que falta caer);
//   - algo propio del consultorio donde hace sentido: la tarjeta de
//     resueltos es una muela con el tilde.
//
// Puramente decorativos (`aria-hidden`); el color y el tamaño los pone
// quien los usa. Cada pieza lleva la clase que dice cómo entra cuando la
// tarjeta se despliega (`.dib-*` en globals.css, dentro de
// `.despliegue-dibujo`); `--i` escalona las que son varias.

const TRAZO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3,
  strokeLinecap: "square" as const,
  strokeLinejoin: "miter" as const,
};

const i = (n: number) => ({ "--i": n }) as CSSProperties;

function svgProps(className: string, viewBox = "0 0 100 100") {
  return {
    "aria-hidden": true as const,
    viewBox,
    className: `despliegue-dibujo ${className}`,
    ...TRAZO,
  };
}

// Turnos de hoy — un reloj con la mañana ya transcurrida rellena (de las
// 12 a las 3): el día como algo que avanza. Las agujas giran hasta su
// lugar cuando la tarjeta aparece.
export function IconoReloj({ className = "" }: IconoDecorativoProps) {
  return (
    <svg {...svgProps(className)}>
      <circle className="dib-trazo" pathLength={1} cx="50" cy="50" r="40" />
      <path className="dib-aparecer" d="M50 50 L50 18 A32 32 0 0 1 82 50 Z" fill="currentColor" fillOpacity="0.35" stroke="none" />
      {[
        [48, 12, 4, 8],
        [80, 48, 8, 4],
        [48, 80, 4, 8],
        [12, 48, 8, 4],
      ].map(([x, y, w, h], n) => (
        <rect key={n} className="dib-aparecer" style={i(n)} x={x} y={y} width={w} height={h} fill="currentColor" stroke="none" />
      ))}
      <g className="dib-girar">
        <path d="M50 50 L50 26" />
        <path d="M50 50 L66 60" />
      </g>
      <rect x="47" y="47" width="6" height="6" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Turnos próximos — los días que vienen, uno detrás del otro: el de
// adelante tiene su encabezado y el turno marcado. Entran deslizándose,
// del más lejano al más cercano.
export function IconoAvance({ className = "" }: IconoDecorativoProps) {
  return (
    <svg {...svgProps(className, "0 0 110 100")}>
      <g className="dib-deslizar" style={i(0)} opacity="0.4">
        <rect x="60" y="10" width="40" height="46" />
      </g>
      <g className="dib-deslizar" style={i(1)} opacity="0.65">
        <rect x="38" y="26" width="40" height="46" />
      </g>
      <g className="dib-deslizar" style={i(2)}>
        <rect x="16" y="42" width="40" height="46" className="fill-marfil" />
        <rect x="16" y="42" width="40" height="11" fill="currentColor" fillOpacity="0.35" />
        <rect x="24" y="61" width="11" height="11" fill="currentColor" stroke="none" />
        <path d="M40 64 L48 64 M40 70 L46 70" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

// Una línea de pendiente -1 recortada a un rectángulo: el rayado de los
// horarios tomados, sin `<pattern>` (que pediría un id único por página).
function rayado(x: number, y: number, w: number, h: number): string {
  const tramos: string[] = [];
  for (let s = x + y + 5; s < x + w + y + h; s += 6) {
    const desde = Math.max(x, s - (y + h));
    const hasta = Math.min(x + w, s - y);
    if (hasta > desde) tramos.push(`M${desde} ${s - desde} L${hasta} ${s - hasta}`);
  }
  return tramos.join(" ");
}

// Horarios reservados — una semana en casilleros; los rayados son los que
// están tomados. Aparecen en ola, en diagonal.
export function IconoCasilleros({ className = "" }: IconoDecorativoProps) {
  const tomados = new Set(["0-1", "1-0", "1-3", "2-2"]);
  const celdas: { x: number; y: number; clave: string; n: number }[] = [];
  for (let f = 0; f < 3; f++) {
    for (let c = 0; c < 4; c++) {
      celdas.push({ x: 6 + c * 23, y: 18 + f * 23, clave: `${f}-${c}`, n: c + f });
    }
  }
  return (
    <svg {...svgProps(className)}>
      {celdas.map(({ x, y, clave, n }) => (
        <g key={clave} className="dib-aparecer" style={i(n)}>
          <rect x={x} y={y} width="18" height="18" />
          {tomados.has(clave) && <path d={rayado(x, y, 18, 18)} strokeWidth="2" strokeLinecap="butt" />}
        </g>
      ))}
    </svg>
  );
}

// Turnos resueltos hoy — una muela con el tilde: lo que se atendió. El
// contorno y el tilde se dibujan solos, en ese orden.
export function IconoTilde({ className = "" }: IconoDecorativoProps) {
  return (
    <svg {...svgProps(className)} strokeLinecap="round" strokeLinejoin="round">
      <path
        className="dib-trazo"
        pathLength={1}
        d="M31 14 C21 14 14 22 15 34 C16 47 21 55 23 68 C25 81 28 90 34 90 C41 90 41 75 45 67 C47 63 48.5 61 50 61 C51.5 61 53 63 55 67 C59 75 59 90 66 90 C72 90 75 81 77 68 C79 55 84 47 85 34 C86 22 79 14 69 14 C61 14 57 18 50 18 C43 18 39 14 31 14 Z"
      />
      <path className="dib-trazo" style={i(2)} pathLength={1} d="M36 34 L46 44 L65 25" strokeWidth="5" />
    </svg>
  );
}

// Turnos pendientes — un reloj de arena: lo que todavía no pasó. Se da
// vuelta al aparecer, como quien lo da vuelta para empezar a contar.
export function IconoSello({ className = "" }: IconoDecorativoProps) {
  return (
    <svg {...svgProps(className)}>
      <g className="dib-girar">
        <rect x="22" y="10" width="56" height="6" fill="currentColor" stroke="none" />
        <rect x="22" y="84" width="56" height="6" fill="currentColor" stroke="none" />
        <path d="M30 16 L70 16 L70 24 C70 38 55 44 53 50 C55 56 70 62 70 76 L70 84 L30 84 L30 76 C30 62 45 56 47 50 C45 44 30 38 30 24 Z" />
        <path d="M37 27 L63 27 C60 36 53 40 50 45 C47 40 40 36 37 27 Z" fill="currentColor" fillOpacity="0.45" stroke="none" />
        <path d="M35 82 C38 72 45 68 50 68 C55 68 62 72 65 82 Z" fill="currentColor" fillOpacity="0.45" stroke="none" />
        <path d="M50 50 L50 66" strokeWidth="2" strokeDasharray="2 3" />
      </g>
    </svg>
  );
}

// Estadística — barras de a pares sobre una línea de base: la de la
// izquierda es "asistieron" (el color de la tarjeta), la de la derecha
// "ausentes" (terracota). Crecen desde la base.
export function IconoEstadistica({ className = "" }: IconoDecorativoProps) {
  const pares: [number, number][] = [
    [46, 14],
    [62, 22],
    [38, 10],
    [70, 18],
  ];
  return (
    <svg {...svgProps(className, "0 0 110 100")}>
      <path d="M4 90 L106 90" />
      {pares.map(([alta, baja], n) => {
        const x = 10 + n * 25;
        return (
          <g key={n}>
            <rect className="dib-crecer" style={i(n)} x={x} y={90 - alta} width="9" height={alta} fill="currentColor" fillOpacity="0.55" stroke="none" />
            <rect
              className="dib-crecer text-terracota-oscuro/40"
              style={i(n + 0.5)}
              x={x + 11}
              y={90 - baja}
              width="9"
              height={baja}
              fill="currentColor"
              stroke="none"
            />
          </g>
        );
      })}
    </svg>
  );
}
