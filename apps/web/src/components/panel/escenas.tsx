import { useId, type CSSProperties, type ReactNode } from "react";
import { usePinturaPrismatica } from "./degrade-prismatico";

// LOS DIBUJOS DE LAS TARJETAS DE /clinicas Y /seleccionar-servicio. Cada
// uno es UN SOLO OBJETO, quieto, sin personas ni piezas de fondo (pedido de
// la persona, ítem 8, 25/10: "diseños mono objeto (...) para evitar
// sobrecarga visual"). La referencia son las ilustraciones "spot" de
// Atlassian y los pictogramas productivos de IBM Carbon. Los objetos de los
// encabezados de los módulos, y su acción al entrar en pantalla, se fueron
// con esos encabezados (pedido de la persona, ítem 8, 26/10: "solo quedará
// el título").
//
// Cada objeto se dibuja en su sistema y se apoya ABAJO a la derecha de su
// caja (`xMaxYMax meet`), que la tarjeta pone contra su esquina. El `viewBox`
// de cada uno (ESCENAS_DE_TARJETA) está calculado con una sola regla (paso
// de diseño del ítem 8, 26/10):
//   - la caja mide 224 px de alto en la computadora, y el alto del `viewBox`
//     fija la escala: todos tienen la misma superficie a la vista, unos
//     195 px de lado (√(ancho × alto)), así la fachada, que es ancha, no
//     pesa más que la agenda, que es cuadrada. El timbre, a 175: es el de la
//     tarjeta más baja (168 px) y a 195 tocaba el borde de arriba;
//   - el borde derecho del `viewBox` queda 12 px antes del objeto y el de
//     abajo, 20 px antes: eso es lo que sale de la tarjeta. La agenda sale
//     39 px por abajo (su grilla se repite y así su tope queda a 34 px del
//     borde de arriba) y el timbre 12, para que se vea su base.
// Así lo que lo identifica (el cartel de la fachada, el encabezado de la
// agenda, la pantalla) queda arriba y a la vista.
//
// DOS CAPAS (`Lienzo`): abajo la línea, el dibujo entero con rellenos blancos
// (que tapan lo que queda detrás) y el contorno en el degradé prismático
// apagado (`usePinturaPrismatica`); arriba los colores, multiplicados. SOBRE
// EL VIDRIO, lo blanco deja pasar el fondo (`Mascara`): una pieza blanca
// queda al 72 %, como la segunda capa del vidrio, y las piezas se siguen
// tapando entre sí. Cada dibujo es una función que recibe un `Lapiz`, y la
// misma función arma las dos capas: `p` (relleno + línea), `r` (solo
// relleno), `t` (solo línea) y `c` (un trazo de color fijo).
//
// LÍNEA: 1,7 px que no escala (`vector-effect` en globals.css).
//
// Decorativos: el contenedor que los usa lleva `aria-hidden`.

// --- Paleta de las escenas -------------------------------------------------

const BLANCO = "var(--color-marfil)";
const MADERA = "var(--color-cascaron)";
const HUESO = "var(--color-hueso)";
const SALVIA_CLARO = "var(--color-salvia-claro)";
const ACERO = "var(--color-acero)";
const ACERO_CLARO = "var(--color-acero-claro)";
const TERRACOTA = "var(--color-terracota)";
const TERRACOTA_CLARO = "var(--color-terracota-claro)";
const MARCA = "var(--color-marca)";
const MARCA_CLARO = "var(--color-marca-claro)";
const NOTA = {
  verde: "var(--esc-nota-verde)",
  celeste: "var(--esc-nota-celeste)",
  rosa: "var(--esc-nota-rosa)",
  lila: "var(--esc-nota-lila)",
};

// --- El lápiz y el lienzo --------------------------------------------------

type Capa = "relleno" | "linea";

interface Estilo {
  style?: CSSProperties;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  display?: string;
}

interface Lapiz {
  /** Relleno (opcional) y contorno prismático. */
  p: (relleno?: string, opacidad?: number) => Estilo;
  /** Solo relleno: un resaltado. */
  r: (relleno: string, opacidad?: number) => Estilo;
  /** Solo la línea prismática: detalles. */
  t: () => Estilo;
  /** Un trazo de un color fijo (el tilde, la firma). */
  c: (color: string, ancho?: number) => Estilo;
}

const OCULTO: Estilo = { display: "none" };

function lapizDe(capa: Capa): Lapiz {
  if (capa === "relleno") {
    const rellenar = (relleno: string, opacidad = 1): Estilo => ({
      style: { fill: relleno, fillOpacity: opacidad },
      stroke: "none",
    });
    return {
      p: (relleno, opacidad) => (relleno ? rellenar(relleno, opacidad) : OCULTO),
      r: rellenar,
      t: () => OCULTO,
      c: (color, ancho = 1.8) => ({ fill: "none", style: { stroke: color }, strokeWidth: ancho }),
    };
  }
  // La capa de la línea es el dibujo entero en blanco: cada pieza tapa lo
  // que quedó detrás (una ficha, la de atrás) y deja ver su contorno.
  const blanco = (opacidad = 1): Estilo => ({ style: { fill: "#fff", fillOpacity: opacidad } });
  return {
    p: (relleno, opacidad) => (relleno ? blanco(opacidad) : { fill: "none" }),
    r: (_relleno, opacidad) => ({ ...blanco(opacidad), stroke: "none" }),
    t: () => ({ fill: "none" }),
    c: () => OCULTO,
  };
}

const LAPIZ_RELLENO = lapizDe("relleno");
const LAPIZ_LINEA = lapizDe("linea");

/**
 * El lápiz de una máscara (`Mascara`): todo se ve entero, menos las piezas
 * blancas, que dejan ver el vidrio. `piezaBlanca` es cuánto se ven. Un blanco
 * con transparencia es un velo sobre otra pieza y se ve entero, igual que los
 * trazos de color.
 */
function lapizDeMascara(piezaBlanca: string): Lapiz {
  const entero: Estilo = { style: { fill: "#fff" } };
  return {
    p: (relleno, opacidad = 1) => {
      if (!relleno) return { fill: "none" };
      return relleno === BLANCO && opacidad === 1 ? { style: { fill: piezaBlanca } } : entero;
    },
    r: () => ({ ...entero, stroke: "none" }),
    t: () => ({ fill: "none" }),
    c: (_color, ancho = 1.8) => ({ fill: "none", style: { stroke: "#fff" }, strokeWidth: ancho }),
  };
}

// La línea deja ver las piezas blancas al 72 % (`--esc-blanco-vidrio`); los
// colores no las tapan (negro): ahí se vería el marfil de su relleno entero.
const LAPIZ_MASCARA_LINEA = lapizDeMascara("var(--esc-blanco-vidrio)");
const LAPIZ_MASCARA_RELLENO = lapizDeMascara("#000");

type Dibujo = (l: Lapiz) => ReactNode;

interface LienzoProps {
  viewBox: string;
  dibujo: Dibujo;
  className?: string;
}

/**
 * Las dos capas de un dibujo, superpuestas en la misma caja. Abajo, la
 * línea: el dibujo entero con rellenos blancos (que tapan lo que queda
 * detrás) y el contorno en el degradé prismático. Arriba, los colores,
 * multiplicados (`.escena-relleno`): sobre el blanco dan su color, y sobre
 * una línea la dejan ver teñida.
 *
 * Cada capa lleva su máscara, con el mismo dibujo: las piezas se tapan entre
 * sí ADENTRO de la capa, y recién después lo blanco deja pasar el vidrio.
 * Bajarle la opacidad al relleno blanco dejaba ver, a través de una pieza,
 * las líneas de la de atrás.
 */
function Lienzo({ viewBox, dibujo, className = "" }: LienzoProps) {
  const [x, y, ancho, alto] = viewBox.split(" ").map(Number);
  const pintura = usePinturaPrismatica(ancho, alto, x, y);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const caja = { x, y, ancho, alto };
  const comun = {
    viewBox,
    preserveAspectRatio: "xMaxYMax meet",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <div className={`escena relative isolate ${className}`}>
      <svg
        {...comun}
        className="escena-linea absolute inset-0 h-full w-full"
        fill="none"
        stroke={pintura.url}
        strokeWidth={1.7}
      >
        {pintura.defs}
        <Mascara id={`vidrio-linea-${id}`} caja={caja} dibujo={dibujo} lapiz={LAPIZ_MASCARA_LINEA} />
        {/* Safari aplica la máscara de un grupo a cada pieza por separado, y
            a través de una pieza blanca se veían las líneas de la de atrás.
            Con una opacidad apenas menor que 1 adentro, compone el grupo
            antes de enmascararlo (medido con el WebKit de Playwright). */}
        <g mask={`url(#vidrio-linea-${id})`}>
          <g opacity={0.999}>{dibujo(LAPIZ_LINEA)}</g>
        </g>
      </svg>
      <svg {...comun} className="escena-relleno absolute inset-0 h-full w-full" fill="none" stroke="none">
        <Mascara id={`vidrio-relleno-${id}`} caja={caja} dibujo={dibujo} lapiz={LAPIZ_MASCARA_RELLENO} />
        <g mask={`url(#vidrio-relleno-${id})`}>{dibujo(LAPIZ_RELLENO)}</g>
      </svg>
    </div>
  );
}

interface MascaraProps {
  id: string;
  caja: { x: number; y: number; ancho: number; alto: number };
  dibujo: Dibujo;
  lapiz: Lapiz;
}

/**
 * La máscara de una capa: blanco de fondo (todo se ve) y el dibujo con
 * `lapiz`. Cubre de sobra la caja del dibujo (1000 unidades a cada lado y
 * tres veces el alto): con `meet`, el SVG puede ser mucho más ancho que su
 * `viewBox` (una caja ancha muestra varias veces su ancho), y afuera de la
 * máscara no se dibuja nada. La luminancia se lee en sRGB, igual en todos
 * los navegadores.
 */
function Mascara({ id, caja, dibujo, lapiz }: MascaraProps) {
  const area = { x: caja.x - 1000, y: caja.y - caja.alto, width: caja.ancho + 2000, height: caja.alto * 3 };
  return (
    <mask id={id} maskUnits="userSpaceOnUse" colorInterpolation="sRGB" {...area}>
      <rect {...area} fill="#fff" />
      <g fill="none" stroke="#fff" strokeWidth={1.7}>
        {dibujo(lapiz)}
      </g>
    </mask>
  );
}

const n1 = (v: number) => Math.round(v * 10) / 10;

// --- Los objetos de las tarjetas -------------------------------------------

// "¿Qué necesitás hoy?" y "¿Dónde trabajás hoy?": un objeto por tarjeta. La
// tarjeta lo pone al lado de la carátula, agrandado y tenue.

export type ServicioConEscena = "agenda" | "pagina" | "equipo";

/** La agenda: el calendario de escritorio, en su atril, con los turnos del mes. */
const servicioAgenda: Dibujo = (l) => (
  <g>
    <path d="M80 104 L92 34 M144 104 L132 34" {...l.t()} />
    <rect x={72} y={30} width={80} height={72} rx={5} {...l.p(BLANCO)} />
    <path d="M72 46 V35 a5 5 0 0 1 5 -5 h70 a5 5 0 0 1 5 5 V46 Z" {...l.p(MARCA_CLARO)} />
    <rect x={92} y={24} width={5} height={11} rx={2.5} {...l.p(HUESO)} />
    <rect x={127} y={24} width={5} height={11} rx={2.5} {...l.p(HUESO)} />
    {[0, 1, 2].flatMap((f) =>
      [0, 1, 2, 3].map((c) => {
        const color = ({ "0-1": NOTA.verde, "1-3": NOTA.rosa, "2-0": NOTA.celeste } as Record<string, string>)[`${f}-${c}`];
        return <rect key={`${f}-${c}`} x={80 + c * 17} y={54 + f * 15} width={12} height={9} rx={2} {...l.p(color ?? BLANCO, color ? 0.9 : 1)} />;
      }),
    )}
    <rect x={95} y={67} width={16} height={13} rx={3.5} {...l.c(MARCA, 1.4)} />
  </g>
);

/** La página: la notebook con la página web en pantalla. */
const servicioPagina: Dibujo = (l) => (
  <g>
    <rect x={66} y={22} width={112} height={76} rx={6} {...l.p(BLANCO)} />
    <rect x={72} y={28} width={100} height={64} rx={3} {...l.p(ACERO_CLARO, 0.6)} />
    <path d="M72 38 V31 a3 3 0 0 1 3 -3 h94 a3 3 0 0 1 3 3 V38 Z" {...l.p(MARCA_CLARO)} />
    <rect x={78} y={43} width={88} height={20} rx={2} {...l.p(SALVIA_CLARO)} />
    <rect x={78} y={68} width={26} height={19} rx={2} {...l.p(BLANCO)} />
    <rect x={109} y={68} width={26} height={19} rx={2} {...l.p(NOTA.rosa, 0.9)} />
    <rect x={140} y={68} width={26} height={19} rx={2} {...l.p(NOTA.lila, 0.9)} />
    <path d="M56 98 H188 L182 104 H62 Z" {...l.p(HUESO)} />
  </g>
);

/** El equipo, sin dibujar personas: tres credenciales colgadas de un perchero. */
const servicioEquipo: Dibujo = (l) => (
  <g>
    <rect x={66} y={12} width={124} height={7} rx={3} {...l.p(MADERA)} />
    {(
      [
        [92, -5, NOTA.verde],
        [128, 2, NOTA.rosa],
        [164, 6, NOTA.celeste],
      ] as const
    ).map(([x, giro, color]) => (
      <g key={x} transform={`rotate(${giro} ${x} 16)`}>
        <circle cx={x} cy={16} r={2.4} {...l.p(HUESO)} />
        <path d={`M${x} 16 L${x - 7} 38 M${x} 16 L${x + 7} 38`} {...l.t()} />
        <rect x={x - 15} y={38} width={30} height={42} rx={4} {...l.p(BLANCO)} />
        <path d={`M${x - 15} 48 V42 a4 4 0 0 1 4 -4 h22 a4 4 0 0 1 4 4 V48 Z`} {...l.p(color)} />
        <rect x={x - 5} y={35} width={10} height={6} rx={1.5} {...l.p(HUESO)} />
        <circle cx={x} cy={60} r={7} {...l.p(HUESO)} />
      </g>
    ))}
  </g>
);

/** La muela del cartel de un consultorio, centrada en (x, y); `s` es la
 *  escala (1 = 14 × 18). Sin `scale()`, para que la línea no engorde. */
function muela(x: number, y: number, s: number): string {
  const p = (a: number, b: number) => `${n1(x + a * s)} ${n1(y + b * s)}`;
  return `M${p(-7, -5)} C${p(-7, -9)} ${p(-3.5, -10)} ${p(-1.5, -9)} L${p(0, -8.4)} L${p(1.5, -9)} C${p(3.5, -10)} ${p(7, -9)} ${p(7, -5)} C${p(7, -1.5)} ${p(5.2, 0.5)} ${p(4.6, 4)} C${p(4.1, 7)} ${p(3.6, 9)} ${p(2.4, 9)} C${p(1, 9)} ${p(0.9, 4.5)} ${p(0, 3)} C${p(-0.9, 4.5)} ${p(-1, 9)} ${p(-2.4, 9)} C${p(-3.6, 9)} ${p(-4.1, 7)} ${p(-4.6, 4)} C${p(-5.2, 0.5)} ${p(-7, -1.5)} ${p(-7, -5)} Z`;
}

/** Mi clínica: la fachada del consultorio, con su cartel, la puerta de
 *  vidrio, una ventana con toldo y otra con la persiana. */
const escenaClinica: Dibujo = (l) => (
  <g>
    <rect x={56} y={22} width={166} height={82} {...l.p(BLANCO)} />
    <rect x={50} y={14} width={178} height={10} rx={2} {...l.p(HUESO)} />
    <rect x={56} y={94} width={166} height={10} {...l.p(HUESO)} />
    <rect x={102} y={30} width={74} height={17} rx={3} {...l.p(MARCA_CLARO)} />
    <path d={muela(139, 38.5, 0.75)} {...l.p(BLANCO)} />
    <path d="M64 52 H112 L108 60 H68 Z" {...l.p(TERRACOTA_CLARO)} />
    <path d="M76 52 L74 60 M88 52 V60 M100 52 L102 60" {...l.t()} />
    <rect x={68} y={62} width={40} height={28} rx={2} {...l.p(ACERO_CLARO, 0.6)} />
    <path d="M88 62 V90 M68 76 H108" {...l.t()} />
    <rect x={124} y={56} width={30} height={46} rx={2} {...l.p(ACERO_CLARO, 0.6)} />
    <path d="M139 56 V102" {...l.t()} />
    <rect x={133} y={77} width={2.4} height={8} rx={1.2} {...l.p(HUESO)} />
    <rect x={143} y={77} width={2.4} height={8} rx={1.2} {...l.p(HUESO)} />
    <rect x={120} y={102} width={38} height={3} rx={1} {...l.p(HUESO)} />
    <rect x={170} y={56} width={40} height={34} rx={2} {...l.p(ACERO_CLARO, 0.6)} />
    <path d="M170 63 H210 M170 70 H210 M170 77 H210" {...l.t()} />
  </g>
);

/** Otra clínica: el timbre del mostrador de recepción. Dibujado en su propio
 *  sistema, con el centro de la base en (0, 0). */
const escenaRecepcion: Dibujo = (l) => (
  <g>
    <rect x={-3} y={-44} width={6} height={10} rx={1.5} {...l.p(HUESO)} />
    <circle cx={0} cy={-47} r={5} {...l.p(HUESO)} />
    <path d="M-35 0 A35 35 0 0 1 35 0 Z" {...l.p(ACERO, 0.55)} />
    <path d="M-21 -13 Q-14 -24 -2 -27" {...l.t()} />
    <rect x={-45} y={0} width={90} height={12} rx={4} {...l.p(HUESO)} />
  </g>
);

/** Crear mi clínica: la maqueta del consultorio sobre su base. */
const escenaCrearClinica: Dibujo = (l) => (
  <g>
    <rect x={76} y={64} width={72} height={40} {...l.p(BLANCO)} />
    <path d="M70 66 L112 38 L154 66 Z" {...l.p(TERRACOTA_CLARO)} />
    <path d={muela(112, 54, 0.6)} {...l.p(BLANCO)} />
    <rect x={102} y={78} width={20} height={26} rx={1.5} {...l.p(ACERO_CLARO, 0.6)} />
    <rect x={83} y={72} width={14} height={12} rx={1.5} {...l.p(ACERO_CLARO, 0.6)} />
    <rect x={127} y={72} width={14} height={12} rx={1.5} {...l.p(ACERO_CLARO, 0.6)} />
    <rect x={64} y={104} width={96} height={6} rx={2} {...l.p(HUESO)} />
  </g>
);

/** Una invitación: el sobre abierto con la tarjeta de la clínica asomando. */
const escenaInvitacion: Dibujo = (l) => (
  <g>
    <path d="M72 60 L122 26 L172 60 Z" {...l.p(MARCA_CLARO)} />
    <rect x={84} y={32} width={76} height={56} rx={3} {...l.p(BLANCO)} />
    <path d={muela(122, 46, 0.8)} {...l.p(MARCA_CLARO)} />
    <path d="M72 60 V104 H172 V60 L122 88 Z" {...l.p(BLANCO)} />
    <path d="M72 104 L110 80 M172 104 L134 80" {...l.t()} />
    <circle cx={122} cy={86} r={5} {...l.p(TERRACOTA, 0.55)} />
  </g>
);

/** Las escenas de /clinicas. */
export type ClinicaConEscena = "clinica" | "otra-clinica" | "crear-clinica" | "invitacion";

/** Cualquier escena de una tarjeta con dibujo (`TarjetaConDibujo`). */
export type DibujoDeTarjeta = ServicioConEscena | ClinicaConEscena;

const ESCENAS_DE_TARJETA: Record<DibujoDeTarjeta, { dibujo: Dibujo; viewBox: string }> = {
  agenda: { dibujo: servicioAgenda, viewBox: "68 -3.9 79.1 91.9" },
  pagina: { dibujo: servicioPagina, viewBox: "52 -26.2 129.6 119.5" },
  equipo: { dibujo: servicioEquipo, viewBox: "62 -34.7 122.3 106.4" },
  clinica: { dibujo: escenaClinica, viewBox: "46 -54.3 174.2 146.2" },
  "otra-clinica": { dibujo: escenaRecepcion, viewBox: "-49 -90.3 88.8 97.1" },
  "crear-clinica": { dibujo: escenaCrearClinica, viewBox: "60 6 94.9 95.5" },
  invitacion: { dibujo: escenaInvitacion, viewBox: "68 -6.5 98.6 101.5" },
};

/** El objeto de una tarjeta con dibujo, abajo a la derecha de su caja. */
export function EscenaDeServicio({ servicio, className }: { servicio: DibujoDeTarjeta; className?: string }) {
  const { dibujo, viewBox } = ESCENAS_DE_TARJETA[servicio];
  return <Lienzo viewBox={viewBox} dibujo={dibujo} className={className} />;
}
