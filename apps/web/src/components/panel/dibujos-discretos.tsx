import type { CSSProperties, ReactNode } from "react";
import type { DibujoDeTarjeta } from "./escenas";

// VARIANTES MÁS DISCRETAS DE LOS DIBUJOS DE LAS TARJETAS (pedido de la
// persona, 28/10: "diseños más simples y discretos encima de una tarjeta de
// diseño glass"). Son una PRUEBA para comparar contra el objeto de hoy
// (`EscenaDeServicio`, escenas.tsx), no un reemplazo todavía: se eligen con
// `?dibujo=` en /seleccionar-servicio o se ven todas juntas en
// /vista-previa/dibujos (solo en desarrollo). Las tres siguen la línea de
// las tarjetas de Apple y Linear: el vidrio lo hacen el desenfoque y el
// color, y lo de encima apenas lo acompaña.
//
//   - `icono`: el ícono de la sección, grande, de trazo fino, a 13 % y
//     recortado por la esquina de abajo a la derecha.
//   - `mancha`: solo una mancha de color de la sección, sin líneas.
//   - `trazo`: el objeto de hoy reducido a la mitad de piezas, en un solo
//     color, sin rellenos, y desvanecido hacia el texto y hacia arriba.
//
// Las tres son decorativas (la caja de la tarjeta lleva `aria-hidden`), no
// se animan y no suman `backdrop-filter`: no cuestan GPU sobre el vidrio.

export type VarianteDeDibujo = "objeto" | "icono" | "mancha" | "trazo";

export const VARIANTES_DE_DIBUJO: readonly VarianteDeDibujo[] = ["objeto", "icono", "mancha", "trazo"];

export const NOMBRE_DE_VARIANTE: Record<VarianteDeDibujo, string> = {
  objeto: "Actual (objeto)",
  icono: "Ícono tenue",
  mancha: "Mancha de color",
  trazo: "Line art reducido",
};

/** Lee `?dibujo=` y cae en el dibujo de hoy si no es una variante. */
export function varianteDeDibujo(valor: string | string[] | undefined): VarianteDeDibujo {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return (VARIANTES_DE_DIBUJO as readonly string[]).includes(v ?? "") ? (v as VarianteDeDibujo) : "objeto";
}

// --- El color de cada sección ----------------------------------------------

/** El tono de la sección (el del ícono y el trazo) y los dos de su mancha. */
const TONOS: Record<DibujoDeTarjeta, { tono: string; mancha: [string, string] }> = {
  agenda: { tono: "var(--color-marca)", mancha: ["var(--color-marca-medio)", "var(--color-acero)"] },
  pagina: { tono: "var(--prisma-violeta)", mancha: ["var(--prisma-violeta)", "var(--prisma-magenta)"] },
  equipo: { tono: "var(--color-terracota)", mancha: ["var(--color-terracota)", "var(--color-salvia)"] },
  clinica: { tono: "var(--color-marca)", mancha: ["var(--color-marca-medio)", "var(--color-salvia)"] },
  "otra-clinica": { tono: "var(--color-acero)", mancha: ["var(--color-acero)", "var(--color-marca-medio)"] },
  "crear-clinica": { tono: "var(--color-terracota)", mancha: ["var(--color-terracota)", "var(--prisma-violeta)"] },
  invitacion: { tono: "var(--color-marca)", mancha: ["var(--color-marca-medio)", "var(--prisma-violeta)"] },
};

// --- 1. El ícono tenue -----------------------------------------------------

// Glifos de 20 × 20, del mismo trazo que `icons.tsx`, para que el ícono
// grande sea el mismo que la persona reconoce en el resto de la app.
const ICONOS: Record<DibujoDeTarjeta, ReactNode> = {
  agenda: (
    <>
      <rect x="2.5" y="3.5" width="15" height="14" rx="1.6" />
      <path d="M2.5 8h15M6 2v3M14 2v3" />
      <path d="M6 11.5h1M9.5 11.5h1M13 11.5h1M6 14.5h1M9.5 14.5h1" />
    </>
  ),
  pagina: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2.2 2.2 3.2 4.7 3.2 7.5s-1 5.3-3.2 7.5c-2.2-2.2-3.2-4.7-3.2-7.5s1-5.3 3.2-7.5Z" />
    </>
  ),
  equipo: (
    <>
      <circle cx="7.2" cy="6.8" r="2.7" />
      <path d="M2 17c.7-2.9 2.6-4.4 5.2-4.4s4.5 1.5 5.2 4.4" />
      <circle cx="13.6" cy="7.4" r="2.2" />
      <path d="M12.7 12.8c2-.1 3.6 1.2 4.3 4.2" />
    </>
  ),
  clinica: (
    <path d="M3.5 7c0-2.6 1.6-4 3.4-4 1.2 0 2 .6 3.1 .6s1.9-.6 3.1-.6c1.8 0 3.4 1.4 3.4 4 0 2.3-1 3.4-1.4 5.6-.4 2.5-.8 4.4-1.9 4.4-1.3 0-1.4-4-3.2-4s-1.9 4-3.2 4c-1.1 0-1.5-1.9-1.9-4.4C4.5 10.4 3.5 9.3 3.5 7Z" />
  ),
  "otra-clinica": (
    <>
      <path d="M3 15.5h14M4.5 15.5a5.5 5.5 0 0 1 11 0" />
      <path d="M10 10V8.5M8.5 8.5h3" />
    </>
  ),
  "crear-clinica": (
    <>
      <path d="M3 9 10 3.5 17 9" />
      <path d="M4.5 8v8.5h11V8" />
      <path d="M10 10.5v4M8 12.5h4" />
    </>
  ),
  invitacion: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="m3 5.5 7 5.5 7-5.5" />
    </>
  ),
};

function IconoTenue({ dibujo }: { dibujo: DibujoDeTarjeta }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke={TONOS[dibujo].tono}
      strokeLinecap="round"
      strokeLinejoin="round"
      // El trazo no escala: a 220 px, el 1,6 del ícono chico sería un
      // marcador grueso. A 1,5 px queda un dibujo de línea fina.
      className="dibujo-discreto absolute -right-4 -bottom-8 size-28 -rotate-12 opacity-[0.16] md:right-2 md:-bottom-6 md:size-44"
      style={{ strokeWidth: 1.5 }}
    >
      {ICONOS[dibujo]}
    </svg>
  );
}

// --- 2. La mancha de color -------------------------------------------------

function ManchaDeColor({ dibujo }: { dibujo: DibujoDeTarjeta }) {
  const [a, b] = TONOS[dibujo].mancha;
  // Dos degradés radiales y ningún `filter: blur`: el desenfoque ya lo hace
  // el vidrio, y un filtro más se recalcularía con el fondo animado.
  const fondo: CSSProperties = {
    background: [
      `radial-gradient(circle 13rem at 78% 95%, color-mix(in oklab, ${a} 34%, transparent), transparent)`,
      `radial-gradient(circle 9rem at 98% 20%, color-mix(in oklab, ${b} 24%, transparent), transparent)`,
    ].join(", "),
  };
  return <div className="absolute inset-y-0 right-0 w-full md:w-[26rem]" style={fondo} />;
}

// --- 3. El line art reducido -----------------------------------------------

// El objeto de cada tarjeta con la mitad de piezas, en un `viewBox` de
// 120 × 100 y apoyado abajo a la derecha: lo que pasa de 120 o de 100 lo
// recorta la tarjeta, igual que hoy.
const TRAZOS: Record<DibujoDeTarjeta, ReactNode> = {
  agenda: (
    <>
      <rect x="34" y="22" width="92" height="88" rx="7" />
      <path d="M34 42h92M56 14v14M104 14v14" />
      <rect x="46" y="54" width="16" height="12" rx="3" />
      <rect x="70" y="54" width="16" height="12" rx="3" />
      <rect x="94" y="54" width="16" height="12" rx="3" />
      <rect x="46" y="76" width="16" height="12" rx="3" />
      <rect x="70" y="76" width="16" height="12" rx="3" strokeWidth={2.4} />
    </>
  ),
  pagina: (
    <>
      <rect x="22" y="22" width="110" height="80" rx="7" />
      <path d="M22 38h110M32 30h0M40 30h0" />
      <rect x="34" y="48" width="86" height="22" rx="3" />
      <path d="M34 82h40" />
    </>
  ),
  equipo: (
    <>
      <path d="M30 14h100" />
      {[58, 98].map((x) => (
        <g key={x}>
          <path d={`M${x} 14 L${x - 8} 40 M${x} 14 L${x + 8} 40`} />
          <rect x={x - 17} y={40} width={34} height={48} rx={5} />
          <circle cx={x} cy={64} r={8} />
        </g>
      ))}
    </>
  ),
  clinica: (
    <>
      <path d="M16 104V30h112" />
      <rect x="40" y="40" width="56" height="16" rx="3" />
      <rect x="54" y="68" width="26" height="40" rx="2" />
      <path d="M67 68v40" />
    </>
  ),
  "otra-clinica": (
    <>
      <path d="M44 92a34 34 0 0 1 68 0" />
      <path d="M34 92h88M78 58v-8M72 50h12" />
    </>
  ),
  "crear-clinica": (
    <>
      <path d="M30 58 76 26l46 32" />
      <path d="M40 52v52h72V52" />
      <rect x="66" y="74" width="20" height="30" rx="2" />
    </>
  ),
  invitacion: (
    <>
      <rect x="26" y="34" width="100" height="70" rx="5" />
      <path d="m28 37 48 36 48-36" />
    </>
  ),
};

function TrazoReducido({ dibujo }: { dibujo: DibujoDeTarjeta }) {
  // Se desvanece hacia la carátula (izquierda) y hacia arriba: queda entero
  // solo contra la esquina.
  const mascara = "linear-gradient(to right, transparent, black 70%), linear-gradient(to top, black 30%, transparent 95%)";
  return (
    <svg
      viewBox="0 0 120 100"
      preserveAspectRatio="xMaxYMax meet"
      fill="none"
      stroke={TONOS[dibujo].tono}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="dibujo-discreto absolute right-0 bottom-0 h-28 w-[70%] opacity-45 md:h-52 md:w-72"
      style={{
        strokeWidth: 1.25,
        maskImage: mascara,
        WebkitMaskImage: mascara,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      {TRAZOS[dibujo]}
    </svg>
  );
}

/** Una de las variantes discretas, para la caja de la escena de la tarjeta. */
export function DibujoDiscreto({ dibujo, variante }: { dibujo: DibujoDeTarjeta; variante: Exclude<VarianteDeDibujo, "objeto"> }) {
  if (variante === "icono") return <IconoTenue dibujo={dibujo} />;
  if (variante === "mancha") return <ManchaDeColor dibujo={dibujo} />;
  return <TrazoReducido dibujo={dibujo} />;
}
