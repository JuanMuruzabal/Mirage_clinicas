import { useId, type CSSProperties, type ReactNode } from "react";
import { usePinturaPrismatica } from "./degrade-prismatico";

// ESCENAS ILUSTRADAS DE LOS ENCABEZADOS DE SECCIÓN (correcciones generales,
// ítem 2, 2026-10-11). Pedido de la persona: escenas con identidad y carisma
// que muestren la ACCIÓN de cada sección, sin personas ("nos concentramos en
// las acciones, como se hizo en la tarjeta del calendario") y, en General,
// Turnos y Pacientes, sin manos ("haga más hincapié en la acción sin las
// manos"): ahí la cuentan los objetos. El tono es serio y cómodo, no
// decorativo (19/10: "que no parezca algo de Pinterest"): objetos de una
// clínica, plantas sobrias y nada de caritas, globos ni destellos.
//
//   - General: el gráfico de la pantalla sube y se tilda, y en la lista de al
//     lado late el indicador y las tareas se tildan de a una.
//   - Turnos: el celular suena en su soporte (vibra, salen ondas), un
//     horario de la agenda se pinta y se tilda solo, y en la tablet de
//     recepción el próximo turno se confirma.
//   - Pacientes: dos fichas del fichero pasan y la del medio sube y se
//     destaca con un tilde.
//   - Documentos: la mano firma la hoja con la birome, y aparece el tilde.
//   - Calendario: la mano clava una notita nueva en el corcho.
//
// LA MANO (Documentos y Calendario) es una sola (`Mano`): derecha, vista
// desde atrás, con el índice extendido; cambian la piel (`--esc-piel-*`), la
// manga y, en Documentos, la birome. En las viñetas de la derecha la mesa y la
// manga salen por el borde de la tarjeta, que las pega a sus bordes
// (`EncabezadoDeSeccion`).
//
// DOS CAPAS (`Lienzo`): abajo la línea, el dibujo entero con rellenos blancos
// (que tapan lo que queda detrás) y el contorno en el degradé prismático
// apagado (`usePinturaPrismatica`) con su giro de tono `dibujo-prismatico`;
// arriba los colores y la tinta, multiplicados. Van separadas porque el giro
// es un `hue-rotate` y, sobre el dibujo entero, giraba también la piel.
// SOBRE EL VIDRIO, lo blanco deja pasar el fondo (`Mascara`): una pieza
// blanca queda al 72 %, como la segunda capa del vidrio, y las piezas se
// siguen tapando entre sí. Cada
// escena se dibuja con una función que recibe un `Lapiz`, y la misma función
// arma las dos capas: `p` (relleno + línea), `r` (solo relleno), `t` (solo
// línea), `k` (tinta) y `c` (un trazo de color fijo: el tilde, la birome).
//
// LÍNEA Y ESCALA: 1,7 px que no escala (`vector-effect` en globals.css). Las
// viñetas de las secciones miden 120 de alto.
//
// MOVIMIENTO: clases `esc-*` de globals.css, sobre un `<g>` INTERIOR; la
// posición va en un `<g transform>` de afuera (el `transform` del CSS pisa el
// del SVG: bug real de la home, CLAUDE.md). Las piezas se mueven solo durante
// la ACCIÓN de su viñeta: una vez, unos 3 s (`accionMs`), cuando
// `TarjetaConEscenas` le pone `.en-accion`, una viñeta por vez y con un
// descanso largo entre una y otra (pedido de la persona, 2026-10-11:
// "acortar las animaciones para optimizar"; los números, en globals.css).
// La viñeta "principal" (la de la derecha, la angosta y el calendario) actúa
// primero. Cada acción arranca y termina en el estado base, que es el mejor
// cuadro de cada pieza (el gráfico crecido, el tilde hecho, la firma
// terminada, la nota clavada): es lo que se ve sin JavaScript y con "reducir
// movimiento". Nada espera a hidratar.
//
// Decorativas: el contenedor que las usa lleva `aria-hidden`.

export type SeccionDelPanel = "general" | "turnos" | "pacientes" | "documentos" | "calendario";

// --- Paleta de las escenas -------------------------------------------------

const TINTA = "var(--color-grafito)";
const BLANCO = "var(--color-marfil)";
const MADERA = "var(--color-cascaron)";
const HUESO = "var(--color-hueso)";
const SALVIA = "var(--color-salvia)";
const SALVIA_CLARO = "var(--color-salvia-claro)";
const ACERO = "var(--color-acero)";
const ACERO_CLARO = "var(--color-acero-claro)";
const ACERO_OSCURO = "var(--color-acero-oscuro)";
const TERRACOTA = "var(--color-terracota)";
const TERRACOTA_CLARO = "var(--color-terracota-claro)";
const MARCA = "var(--color-marca)";
const MARCA_MEDIO = "var(--color-marca-medio)";
const MARCA_CLARO = "var(--color-marca-claro)";
// Telas opacas: con un relleno translúcido se veía lo que había detrás.
const AMBO = "color-mix(in oklab, var(--color-marca-medio) 82%, white)";
const PIEL = {
  clara: "var(--esc-piel-clara)",
  miel: "var(--esc-piel-miel)",
  triguena: "var(--esc-piel-triguena)",
  morena: "var(--esc-piel-morena)",
  oscura: "var(--esc-piel-oscura)",
};
const NOTA = {
  verde: "var(--esc-nota-verde)",
  celeste: "var(--esc-nota-celeste)",
  dorada: "var(--esc-nota-dorada)",
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
  /** Solo relleno: brillos, sombras, ojos. */
  r: (relleno: string, opacidad?: number) => Estilo;
  /** Solo la línea prismática: detalles, ondas. */
  t: () => Estilo;
  /** Tinta quieta: los rasgos de la cara. */
  k: (ancho?: number, opacidad?: number) => Estilo;
  /** Un trazo de un color fijo (el tilde, la birome). */
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
      k: (ancho = 1.5, opacidad = 1) => ({
        fill: "none",
        style: { stroke: TINTA, strokeOpacity: opacidad },
        strokeWidth: ancho,
      }),
      c: (color, ancho = 1.8) => ({ fill: "none", style: { stroke: color }, strokeWidth: ancho }),
    };
  }
  // La capa de la línea es el dibujo entero en blanco: cada pieza tapa lo
  // que quedó detrás (el cuello no cruza la cara) y deja ver su contorno.
  const blanco = (opacidad = 1): Estilo => ({ style: { fill: "#fff", fillOpacity: opacidad } });
  return {
    p: (relleno, opacidad) => (relleno ? blanco(opacidad) : { fill: "none" }),
    r: (_relleno, opacidad) => ({ ...blanco(opacidad), stroke: "none" }),
    t: () => ({ fill: "none" }),
    k: () => OCULTO,
    c: () => OCULTO,
  };
}

const LAPIZ_RELLENO = lapizDe("relleno");
const LAPIZ_LINEA = lapizDe("linea");

/**
 * El lápiz de una máscara (`Mascara`): todo se ve entero, menos las piezas
 * blancas, que dejan ver el vidrio. `piezaBlanca` es cuánto se ven. Un blanco
 * con transparencia (los cajones del archivero) es un velo sobre otra pieza
 * y se ve entero, igual que la tinta y los trazos de color.
 */
function lapizDeMascara(piezaBlanca: string): Lapiz {
  const entero: Estilo = { style: { fill: "#fff" } };
  const trazo = (ancho: number): Estilo => ({ fill: "none", style: { stroke: "#fff" }, strokeWidth: ancho });
  return {
    p: (relleno, opacidad = 1) => {
      if (!relleno) return { fill: "none" };
      return relleno === BLANCO && opacidad === 1 ? { style: { fill: piezaBlanca } } : entero;
    },
    r: () => ({ ...entero, stroke: "none" }),
    t: () => ({ fill: "none" }),
    k: (ancho = 1.5) => trazo(ancho),
    c: (_color, ancho = 1.8) => trazo(ancho),
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
  /** Cuánto dura la acción de la viñeta (las animaciones `esc-*`). */
  accionMs: number;
  /** La viñeta que cuenta la acción de la sección: actúa primero. */
  principal?: boolean;
  alinear?: string;
  /** La caja toma el ancho de su `viewBox` (con su alto puesto por afuera). */
  ajustarAncho?: boolean;
  /** Cuántas veces recorre el arco prismático la línea (`DegradePrismatico`). */
  vueltas?: number;
  className?: string;
}

/**
 * Las dos capas de una viñeta, superpuestas en la misma caja. Abajo, la
 * línea: el dibujo entero con rellenos blancos (que tapan lo que queda
 * detrás) y el contorno en el degradé prismático, con su giro de tono; el
 * blanco no cambia al girar. Arriba, los colores y la tinta, multiplicados
 * (`.escena-relleno`): sobre el blanco dan su color, y sobre una línea la
 * dejan ver teñida. Así el giro no toca la piel.
 *
 * Cada capa lleva su máscara, con el mismo dibujo (y las mismas clases, así
 * acompaña lo que se mueve): las piezas se tapan entre sí ADENTRO de la capa,
 * y recién después lo blanco deja pasar el vidrio. Bajarle la opacidad al
 * relleno blanco dejaba ver, a través de una pieza, las líneas de la de
 * atrás (las fichas del fichero).
 */
function Lienzo({ viewBox, dibujo, accionMs, principal = false, alinear = "xMidYMid meet", ajustarAncho = false, vueltas = 1, className = "" }: LienzoProps) {
  const [x, y, ancho, alto] = viewBox.split(" ").map(Number);
  const pintura = usePinturaPrismatica(ancho, alto, x, y, vueltas);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const caja = { x, y, ancho, alto };
  const comun = {
    viewBox,
    preserveAspectRatio: alinear,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <div
      className={`escena relative isolate ${className}`}
      data-accion={principal ? "principal" : "secundaria"}
      data-accion-ms={accionMs}
      style={{ "--accion": `${accionMs}ms`, ...(ajustarAncho ? { aspectRatio: `${ancho} / ${alto}` } : {}) } as CSSProperties}
    >
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
 * `lapiz`. Cubre tres veces la caja del dibujo: con `meet`, el SVG puede ser
 * más ancho que su `viewBox`, y la mesa y la manga siguen de largo. La
 * luminancia se lee en sRGB, igual en todos los navegadores.
 */
function Mascara({ id, caja, dibujo, lapiz }: MascaraProps) {
  const area = { x: caja.x - caja.ancho, y: caja.y - caja.alto, width: caja.ancho * 3, height: caja.alto * 3 };
  return (
    <mask id={id} maskUnits="userSpaceOnUse" colorInterpolation="sRGB" {...area}>
      <rect {...area} fill="#fff" />
      <g fill="none" stroke="#fff" strokeWidth={1.7}>
        {dibujo(lapiz)}
      </g>
    </mask>
  );
}

// --- Piezas ---------------------------------------------------------------

type Punto = [number, number];

const n1 = (v: number) => Math.round(v * 10) / 10;

/**
 * El contorno de un "tubo" que pasa por `puntos` (brazos, piernas, la vincha
 * de los auriculares), con las puntas redondas. Solo sumas, productos y
 * raíces: dan el mismo número en el servidor y en cualquier navegador, y el
 * `d` no cambia al hidratar.
 */
function tubo(puntos: Punto[], ancho: number, fin: "redondo" | "recto" = "redondo"): string {
  const h = ancho / 2;
  const n = puntos.length;
  const dir = (a: Punto, b: Punto): Punto => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const largo = Math.sqrt(dx * dx + dy * dy) || 1;
    return [dx / largo, dy / largo];
  };
  const desvio = (i: number): Punto => {
    let d: Punto;
    let escala = 1;
    if (i === 0) d = dir(puntos[0], puntos[1]);
    else if (i === n - 1) d = dir(puntos[n - 2], puntos[n - 1]);
    else {
      const a = dir(puntos[i - 1], puntos[i]);
      const b = dir(puntos[i], puntos[i + 1]);
      const sx = a[0] + b[0];
      const sy = a[1] + b[1];
      const largo = Math.sqrt(sx * sx + sy * sy) || 1;
      d = [sx / largo, sy / largo];
      escala = 1 / Math.max(a[0] * d[0] + a[1] * d[1], 0.6);
    }
    return [-d[1] * h * escala, d[0] * h * escala];
  };
  const izq: Punto[] = [];
  const der: Punto[] = [];
  puntos.forEach((p, i) => {
    const [ox, oy] = desvio(i);
    izq.push([n1(p[0] + ox), n1(p[1] + oy)]);
    der.push([n1(p[0] - ox), n1(p[1] - oy)]);
  });
  const r = n1(h);
  const ida = izq.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const ultimo = der[n - 1];
  const vuelta = der
    .slice(0, -1)
    .reverse()
    .map(([x, y]) => `L${x} ${y}`)
    .join(" ");
  const punta = fin === "recto" ? `L${ultimo[0]} ${ultimo[1]}` : `A${r} ${r} 0 0 0 ${ultimo[0]} ${ultimo[1]}`;
  return `${ida} ${punta} ${vuelta} A${r} ${r} 0 0 0 ${izq[0][0]} ${izq[0][1]} Z`;
}

/**
 * Agranda un personaje sin redibujarlo: lo que está dibujado alrededor de
 * `desde` aparece alrededor de `hasta`, `escala` veces más grande (la línea no
 * engorda: no escala). Adentro, un `transform-origin` en px sigue en las
 * coordenadas del dibujo.
 */
const agrandar = (desde: Punto, hasta: Punto, escala: number) =>
  `translate(${hasta[0]} ${hasta[1]}) scale(${escala}) translate(${-desde[0]} ${-desde[1]})`;

/** Una planta en maceta, que se mece. `x`: el centro de la maceta. */
function Planta({ l, x, y }: { l: Lapiz; x: number; y: number }) {
  return (
    <g>
      <g className="esc-mecer">
        <path d={`M${x} ${y} C${x - 8} ${y - 9} ${x - 10} ${y - 19} ${x - 5} ${y - 28} C${x + 2} ${y - 20} ${x + 4} ${y - 10} ${x} ${y} Z`} {...l.p(SALVIA, 0.55)} />
        <path d={`M${x} ${y} C${x + 7} ${y - 8} ${x + 13} ${y - 15} ${x + 15} ${y - 24} C${x + 7} ${y - 21} ${x + 2} ${y - 11} ${x} ${y} Z`} {...l.p(SALVIA, 0.55)} />
        <path d={`M${x} ${y} C${x - 5} ${y - 5} ${x - 13} ${y - 7} ${x - 18} ${y - 5} C${x - 13} ${y} ${x - 6} ${y + 1} ${x} ${y} Z`} {...l.p(SALVIA, 0.55)} />
        <path d={`M${x} ${y - 2} C${x - 3} ${y - 10} ${x - 4} ${y - 18} ${x - 5} ${y - 25}`} {...l.t()} />
      </g>
      <path d={`M${x - 10} ${y} H${x + 10} L${x + 7} ${y + 19} H${x - 7} Z`} {...l.p(TERRACOTA, 0.45)} />
    </g>
  );
}

const retrasar = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

// --- Las viñetas de la izquierda (objetos) -----------------------------------

/** Reloj de pared, el diploma enmarcado y un estante con libros y una planta;
 *  abajo, la mesa con otra planta. */
const generalIzquierda: Dibujo = (l) => (
  <g>
    <MesaIzquierda l={l} hasta={389} />
    <Planta l={l} x={362} y={85} />
    {/* Lo de la pared, arriba de la mesa. */}
    <g transform="translate(0 -17)">
    <circle cx={100} cy={62} r={23} {...l.p(BLANCO)} />
    <circle cx={100} cy={62} r={19} {...l.p(MARCA_CLARO, 0.6)} />
    <path d="M100 46 v3.5 M116 62 h-3.5 M100 78 v-3.5 M84 62 h3.5" {...l.k(1.3, 0.6)} />
    <path d="M100 62 L108 67" {...l.k(1.8)} />
    <g className="esc-agujas">
      <path d="M100 62 V47" {...l.k(1.4)} />
    </g>
    <circle cx={100} cy={62} r={1.9} {...l.r(TINTA)} />

    <path d="M160 30 L176 18 L192 30" {...l.t()} />
    <circle cx={176} cy={18} r={1.6} {...l.r(TINTA, 0.6)} />
    <rect x={150} y={30} width={52} height={60} rx={4} {...l.p(MADERA)} />
    <rect x={155} y={35} width={42} height={50} rx={1.5} {...l.p(BLANCO)} />
    <rect x={163} y={42} width={26} height={3.4} rx={1.7} {...l.r(TINTA, 0.28)} />
    <path d="M161 52 h30 M163 58 h26 M167 64 h18" {...l.t()} />
    <path d="M173.4 78.6 L171.8 83.4 M178.6 78.6 L180.2 83.4" {...l.t()} />
    <circle cx={176} cy={75.4} r={4.6} {...l.p(MARCA_CLARO)} />

    <path d="M226 105 V113 L236 105 M318 105 V113 L308 105" {...l.t()} />
    <rect x={222} y={72} width={11} height={30} rx={1.5} {...l.p(ACERO_CLARO)} />
    <rect x={234} y={76} width={12} height={26} rx={1.5} {...l.p(SALVIA_CLARO)} />
    <rect x={247} y={68} width={10} height={34} rx={1.5} {...l.p(TERRACOTA_CLARO)} />
    <path d="M259 102 L268 75 L278 78 L269 102 Z" {...l.p(MARCA_CLARO)} />
    <path d="M225 78 h5 M250 75 h4 M237 82 h6" {...l.t()} />
    <path d="M310 86 C305 78 306 72 310 67 C314 72 314 79 310 86 Z" {...l.p(SALVIA, 0.55)} />
    <path d="M310 86 C315 80 321 78 326 79 C322 84 316 87 310 86 Z" {...l.p(SALVIA, 0.55)} />
    <path d="M298 86 H322 L319 102 H301 Z" {...l.p(TERRACOTA, 0.45)} />
    <rect x={214} y={102} width={116} height={5} rx={2} {...l.p(MADERA)} />
    </g>
  </g>
);

/** El archivero con carpetas, la sansevieria, tres biblioratos y el vaso con
 *  biromes. */
const documentosIzquierda: Dibujo = (l) => (
  <g>
    <MesaIzquierda l={l} hasta={388.5} />
    {/* El vaso con biromes, del lado del título. */}
    <g transform="translate(332.5 0)">
      <path d={tubo([[30, 86], [27, 72]], 2.4)} {...l.p(TERRACOTA, 0.8)} />
      <path d={tubo([[34, 86], [36, 70]], 2.4)} {...l.p(ACERO, 0.8)} />
      <path d={tubo([[38, 86], [43, 74]], 2.4)} {...l.p(MARCA_MEDIO)} />
      <rect x={24} y={84} width={20} height={21} rx={3} {...l.p(ACERO_CLARO)} />
    </g>
    {/* Dibujado sobre un piso en y = 170: sube al tablero. */}
    <g transform="translate(0 -66)">
    <ellipse cx={186} cy={172} rx={46} ry={3} {...l.r(TINTA, 0.06)} />
    <ellipse cx={80} cy={172} rx={22} ry={3} {...l.r(TINTA, 0.06)} />
    <g className="esc-mecer">
      <path d="M74 140 C70 118 70 98 76 80 C80 100 80 120 78 140 Z" {...l.p(SALVIA, 0.55)} />
      <path d="M82 140 C82 112 86 92 93 76 C95 100 91 122 87 140 Z" {...l.p(SALVIA, 0.55)} />
      <path d="M88 140 C92 122 98 110 105 102 C103 118 97 130 93 140 Z" {...l.p(SALVIA, 0.55)} />
      <path d="M68 140 C64 128 58 120 52 116 C56 126 62 134 72 140 Z" {...l.p(SALVIA, 0.55)} />
      <path d="M74 110 l4 -2 M75 124 l3.6 -2 M85 104 l5 -2 M84 120 l4.6 -2" {...l.t()} />
    </g>
    <path d="M64 140 H96 L92 170 H68 Z" {...l.p(TERRACOTA, 0.45)} />

    <rect x={150} y={94} width={72} height={76} rx={4} {...l.p(ACERO_CLARO)} />
    <rect x={156} y={100} width={60} height={31} rx={3} {...l.p(BLANCO, 0.7)} />
    <rect x={156} y={135} width={60} height={31} rx={3} {...l.p(BLANCO, 0.7)} />
    <rect x={178} y={104} width={16} height={6} rx={1.5} {...l.p(HUESO)} />
    <rect x={178} y={139} width={16} height={6} rx={1.5} {...l.p(HUESO)} />
    <path d={tubo([[176, 117], [196, 117]], 3.4)} {...l.p(ACERO, 0.6)} />
    <path d={tubo([[176, 152], [196, 152]], 3.4)} {...l.p(ACERO, 0.6)} />
    <rect x={154} y={73} width={56} height={7} rx={2} {...l.p(SALVIA_CLARO)} />
    <rect x={160} y={80} width={54} height={7} rx={2} {...l.p(MARCA_CLARO)} />
    <rect x={155} y={87} width={58} height={7} rx={2} {...l.p(TERRACOTA_CLARO)} />
    <path d="M198 73 v-4 h8 v4" {...l.p(SALVIA_CLARO)} />

    <g transform="translate(24 0)">
    <ellipse cx={276} cy={172} rx={32} ry={3} {...l.r(TINTA, 0.06)} />
    {(
      [
        [246, 112, SALVIA_CLARO, 0],
        [264, 108, ACERO_CLARO, 0],
        [282, 114, TERRACOTA_CLARO, 8],
      ] as const
    ).map(([x, y, color, giro]) => (
      <g key={x} transform={giro ? `rotate(${giro} ${x} 170)` : undefined}>
        <rect x={x} y={y} width={17} height={170 - y} rx={2} {...l.p(color)} />
        <rect x={x + 3} y={y + 8} width={11} height={14} rx={1.5} {...l.p(BLANCO)} />
        <circle cx={x + 8.5} cy={158} r={3} {...l.p(BLANCO)} />
      </g>
    ))}
    </g>
    </g>
  </g>
);

// --- La mano ---------------------------------------------------------------

// La mano de todas las escenas: una mano derecha vista desde atrás, con el
// índice extendido, el resto del puño cerrado y el pulgar recogido. Se dibuja
// con la punta del índice en (0, 0), apuntando hacia arriba (y negativo), y la
// muñeca abajo; la manga sigue de largo para salir por el borde del dibujo.
const MANO =
  "M-5.5 31 V5.5 A5.5 5.5 0 0 1 5.5 5.5 V27 A3.6 3.6 0 0 1 12.6 28 A3.4 3.4 0 0 1 19.2 30.5 A3.2 3.2 0 0 1 25 34.5 C26.6 42 26 52 22 60 L19 66 V84 H-3 V66 C-5 62 -6.5 58 -7 54 C-11 50 -15.4 45 -16 40.4 A3.6 3.6 0 0 1 -9.6 37 C-8 38 -6.4 36 -5.5 31 Z";

interface ManoProps {
  l: Lapiz;
  /** Dónde queda la punta del índice. */
  x: number;
  y: number;
  /** Giro de la mano: 0 apunta hacia arriba; −70, hacia arriba y a la izquierda. */
  giro: number;
  escala?: number;
  piel: string;
  manga: string;
  puno: string;
  /** La clase del movimiento, en el `<g>` de adentro (sus traslaciones van en
   *  el sistema de la mano: y positivo es "hacia la muñeca"). */
  className?: string;
  style?: CSSProperties;
  /** Con una birome bajo el índice, la punta en (−3, −18). */
  birome?: boolean;
}

function Mano({ l, x, y, giro, escala = 1, piel, manga, puno, className, style, birome }: ManoProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro})${escala === 1 ? "" : ` scale(${escala})`}`}>
      <g className={className} style={style}>
        <path d="M-8 90 H24 L40.7 320 H-24.7 Z" {...l.p(manga)} />
        {birome && (
          <g>
            <path d="M-5.3 40 V-11 H-0.7 V40 Z" {...l.p(ACERO, 0.9)} />
            <path d="M-5.3 -11 L-3 -18 L-0.7 -11 Z" {...l.p(HUESO)} />
          </g>
        )}
        <path d={MANO} {...l.p(piel)} />
        <path d="M-3 7 Q0 4.2 3 7" {...l.k(1.1, 0.55)} />
        <path d="M-3.4 20 Q0 21.6 3.4 20" {...l.k(1.1, 0.45)} />
        <path d="M12.5 29.5 V35 M19 31.4 V37.4 M-10 44 Q-7.4 46 -5 44.6" {...l.k(1.1, 0.45)} />
        <rect x={-7} y={80} width={30} height={13} rx={3.5} {...l.p(puno)} />
      </g>
    </g>
  );
}

/**
 * La mesa de las viñetas de la derecha: la tabla y el frente. A la izquierda
 * termina adentro del dibujo; a la derecha y abajo sigue de largo, porque la
 * tarjeta pega esa viñeta a sus bordes (y en una caja más ancha que el dibujo
 * tiene que llegar igual).
 */
function Mesa({ l, desde }: { l: Lapiz; desde: number }) {
  return (
    <g>
      <path d={`M${desde + 6} 110 H520 V150 H${desde + 6} Z`} {...l.p("var(--esc-madera-frente)")} />
      <path d={`M${desde} 104 H520 V110 H${desde} Z`} {...l.p(MADERA)} />
    </g>
  );
}

/** La misma mesa, en espejo: la de las viñetas de la izquierda, que sale por
 *  el borde izquierdo. `hasta`: dónde termina, del lado del título. */
function MesaIzquierda({ l, hasta }: { l: Lapiz; hasta: number }) {
  return (
    <g>
      <path d={`M${hasta - 6} 110 H-200 V150 H${hasta - 6} Z`} {...l.p("var(--esc-madera-frente)")} />
      <path d={`M${hasta} 104 H-200 V110 H${hasta} Z`} {...l.p(MADERA)} />
    </g>
  );
}

// Las viñetas miden 120 de alto. Las dos de una sección, el mismo ancho
// (`RECORTE`), y todo apoyado en su mesa (el tablero en y = 104).

// --- General: el gráfico sube y todo se confirma ---------------------------

/** La pantalla con el gráfico que crece y su tilde, y al lado la lista que se va tildando con un indicador que late. */
const generalDerecha: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={14} />
    <rect x={26} y={6} width={180} height={86} rx={7} {...l.p(BLANCO)} />
    <rect x={33} y={13} width={166} height={67} rx={3} {...l.p(ACERO_CLARO, 0.75)} />
    <path d="M40 72.5 H104" {...l.t()} />
    {[0, 1, 2, 3].map((i) => (
      <rect
        key={i}
        className="esc-crecer"
        style={retrasar(i * 100)}
        x={44 + i * 15}
        y={72 - (12 + i * 8)}
        width={11}
        height={12 + i * 8}
        rx={2}
        {...l.p(MARCA_MEDIO, 0.9)}
      />
    ))}
    <path className="esc-trazo" pathLength={1} d="M114 70 L128 62 L142 66 L158 52 L174 47" {...l.c(MARCA, 1.6)} />
    <circle cx={183} cy={30} r={10} {...l.p(BLANCO)} />
    <path className="esc-tilde" pathLength={1} d="M178 30.5 L181.6 34 L188 27" {...l.c(MARCA, 2)} />
    <path d="M106 92 L103 104 H123 L120 92 Z" {...l.p(HUESO)} />
    <ellipse cx={113} cy={104} rx={22} ry={2.4} {...l.p(HUESO)} />

    {/* La lista: el indicador late y las tareas se tildan de a una. */}
    <rect x={226} y={26} width={100} height={78} rx={6} {...l.p(BLANCO)} />
    <circle className="esc-latido" cx={240} cy={40} r={5} {...l.r(MARCA_MEDIO, 0.5)} />
    <circle cx={240} cy={40} r={3.6} {...l.p(MARCA_MEDIO)} />
    <rect x={250} y={38} width={50} height={4} rx={2} {...l.r(TINTA, 0.22)} />
    {[56, 44, 50].map((largo, i) => {
      const y = 57 + i * 15;
      return (
        <g key={i}>
          <rect x={236} y={y - 5} width={9} height={9} rx={2} {...l.p(BLANCO)} />
          <path className="esc-tilde" style={retrasar(250 + i * 150)} pathLength={1} d={`M237.8 ${y} L240 ${y + 2.4} L244 ${y - 2.6}`} {...l.c(MARCA, 1.8)} />
          <path d={`M252 ${y} h${largo}`} {...l.t()} />
        </g>
      );
    })}
  </g>
);

// --- Turnos: el celular suena y el turno se marca --------------------------

/** La agenda, donde un horario se pinta y se tilda solo, y el celular que suena en su soporte. */
const turnosDerecha: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={14} />
    <path d="M110 100 L104 106 H140 L134 100 Z" {...l.p(HUESO)} />
    <rect x={26} y={6} width={184} height={94} rx={9} {...l.p(BLANCO)} />
    <rect x={34} y={14} width={168} height={78} rx={4} {...l.p(ACERO_CLARO, 0.6)} />
    <path d="M34 28 V18 Q34 14 38 14 H198 Q202 14 202 18 V28 Z" {...l.p(TERRACOTA, 0.45)} />
    {[0, 1, 2, 3, 4].map((i) => (
      <circle key={i} cx={60 + i * 29} cy={21} r={3.6} {...(i === 2 ? l.p(MARCA_MEDIO) : l.r(BLANCO, 0.9))} />
    ))}
    {[0, 1, 2].map((i) => (
      <g key={i}>
        <rect x={42} y={40 + i * 18} width={16} height={4} rx={2} {...l.r(TINTA, 0.22)} />
        <rect x={64} y={36 + i * 18} width={130} height={12} rx={3} {...l.p(BLANCO)} />
      </g>
    ))}
    <rect className="esc-resaltar" x={64} y={54} width={130} height={12} rx={3} {...l.r(MARCA_MEDIO, 0.6)} />
    <path className="esc-tilde" style={retrasar(300)} pathLength={1} d="M176 60.5 L179.4 63.8 L186 56.8" {...l.c(MARCA, 2)} />

    {/* El celular, parado en su soporte: vibra (gira apenas sobre su base,
        adentro del soporte) y salen las ondas por los dos lados. En la
        pantalla, una llamada entrante: el contacto y los dos botones. Más
        cerca de la agenda (`translate`), así la viñeta mide lo mismo que la
        de la izquierda. */}
    <g transform="translate(-24 0)">
    {[0, 1].map((i) => (
      <g key={i} className="esc-onda" style={retrasar(i * 150)}>
        <path d={i ? "M256 34 q-12 19 0 38 M344 34 q12 19 0 38" : "M266 41 q-7 12 0 24 M334 41 q7 12 0 24"} {...l.t()} />
      </g>
    ))}
    <g className="esc-vibrar">
      <rect x={277} y={8} width={46} height={88} rx={8} {...l.p(BLANCO)} />
      <rect x={281.5} y={14} width={37} height={74} rx={4} {...l.p(ACERO_CLARO, 0.7)} />
      <rect x={295} y={17} width={10} height={3} rx={1.5} {...l.r(TINTA, 0.45)} />
      <circle cx={300} cy={36} r={8.5} {...l.p(MARCA_CLARO)} />
      <circle cx={300} cy={33.4} r={3} {...l.r(BLANCO, 0.9)} />
      <path d="M294.6 42.4 Q294.6 37.6 300 37.6 Q305.4 37.6 305.4 42.4 Z" {...l.r(BLANCO, 0.9)} />
      <rect x={289} y={50} width={22} height={3.6} rx={1.8} {...l.r(TINTA, 0.3)} />
      <rect x={292.5} y={57} width={15} height={2.8} rx={1.4} {...l.r(TINTA, 0.18)} />
      <circle cx={290.5} cy={74} r={5} {...l.p(TERRACOTA, 0.85)} />
      <circle cx={309.5} cy={74} r={5} {...l.p(MARCA_MEDIO)} />
      <rect x={294} y={83.6} width={12} height={1.6} rx={0.8} {...l.r(TINTA, 0.3)} />
    </g>
    {/* El soporte: el labio de adelante tapa la base del celular. */}
    <path d="M286 96 L282 104 H318 L314 96 Z" {...l.p(MADERA)} />
    <rect x={281} y={88} width={38} height={9} rx={2.5} {...l.p(MADERA)} />
    </g>
  </g>
);

/**
 * El escritorio de recepción: la tablet en su atril con los turnos del día,
 * donde el próximo se confirma (el tilde aparece y late), y una planta.
 */
const turnosIzquierda: Dibujo = (l) => (
  <g>
    <MesaIzquierda l={l} hasta={378} />
    <ellipse cx={120} cy={106} rx={44} ry={2.6} {...l.r(TINTA, 0.06)} />
    <ellipse cx={222} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={285} cy={106} rx={21} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={348} cy={106} rx={20} ry={2.2} {...l.r(TINTA, 0.06)} />
    {/* El timbre de recepción y dos libros, uno sobre el otro. */}
    <rect x={266} y={98} width={38} height={6} rx={2} {...l.p(MADERA)} />
    <path d="M270 98 A15 15 0 0 1 300 98 Z" {...l.p(ACERO_CLARO)} />
    <path d="M276 92 Q279 86 285 85" {...l.t()} />
    <rect x={283} y={78} width={4} height={5} rx={1} {...l.p(HUESO)} />
    <circle cx={285} cy={77} r={2.6} {...l.p(ACERO_CLARO)} />
    <rect x={330} y={96} width={36} height={8} rx={1.5} {...l.p(SALVIA_CLARO)} />
    <rect x={333} y={88} width={31} height={8} rx={1.5} {...l.p(TERRACOTA_CLARO)} />
    <path d="M336 100 h22 M339 92 h18" {...l.t()} />
    <path d="M110 84 L100 104 H140 L130 84 Z" {...l.p(MADERA)} />
    <rect x={66} y={14} width={108} height={74} rx={9} {...l.p(BLANCO)} />
    <rect x={73} y={21} width={94} height={60} rx={4} {...l.p(ACERO_CLARO, 0.6)} />
    <rect x={80} y={27} width={30} height={3.6} rx={1.8} {...l.r(TINTA, 0.28)} />
    {[24, 30, 20].map((largo, i) => {
      const y = 36 + i * 14;
      return (
        <g key={i}>
          <rect x={80} y={y + 3.7} width={10} height={3.6} rx={1.8} {...l.r(TINTA, 0.22)} />
          <rect x={95} y={y} width={65} height={11} rx={2.5} {...l.p(BLANCO)} />
          <path d={`M101 ${y + 5.5} h${largo}`} {...l.t()} />
          {i === 1 ? (
            <g>
              <circle className="esc-latido" cx={152} cy={y + 5.5} r={5} {...l.r(MARCA_MEDIO, 0.45)} />
              <g className="esc-destacar">
                <circle cx={152} cy={y + 5.5} r={3.8} {...l.p(MARCA_MEDIO)} />
                <path d={`M150.1 ${y + 5.6} L151.5 ${y + 7.1} L154.1 ${y + 4.1}`} {...l.c(BLANCO, 1.3)} />
              </g>
            </g>
          ) : (
            <circle cx={152} cy={y + 5.5} r={2.4} {...l.p(HUESO)} />
          )}
        </g>
      );
    })}
    <Planta l={l} x={222} y={85} />
  </g>
);

// --- Pacientes: el fichero -------------------------------------------------

const FICHAS: { tab: number; color: string }[] = [
  { tab: 64, color: NOTA.verde },
  { tab: 104, color: NOTA.celeste },
  { tab: 150, color: NOTA.rosa },
  { tab: 86, color: NOTA.dorada },
  { tab: 128, color: NOTA.lila },
  { tab: 174, color: NOTA.verde },
];

/** Las fichas pasan de a una y la del medio sube y se destaca con un tilde. */
const pacientesDerecha: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={26} />
    {FICHAS.map(({ tab, color }, i) => {
      const arriba = 22 + i * 7;
      const destacada = i === 2;
      return (
        <g key={i} className={destacada ? "esc-ficha" : i < 2 ? "esc-pasar" : undefined} style={i < 2 ? retrasar(i * 200) : undefined}>
          <rect x={tab} y={arriba - 7} width={24} height={9} rx={2} {...l.p(color)} />
          <rect x={50} y={arriba} width={200} height={56} rx={3} {...l.p(BLANCO)} />
          <path d={`M60 ${arriba + 8} h52 M60 ${arriba + 14} h32`} {...l.t()} />
          {destacada && (
            <g className="esc-destacar">
              <circle cx={tab + 12} cy={arriba - 16} r={6.5} {...l.p(MARCA_MEDIO)} />
              <path d={`M${tab + 9} ${arriba - 16} L${tab + 11.2} ${arriba - 13.6} L${tab + 15.2} ${arriba - 18.6}`} {...l.c(BLANCO, 1.6)} />
            </g>
          )}
        </g>
      );
    })}
    <path d="M38 64 H262 L256 106 H44 Z" {...l.p(TERRACOTA_CLARO)} />
    <rect x={132} y={76} width={36} height={11} rx={2} {...l.p(BLANCO)} />
    <path d="M139 81.5 h22" {...l.t()} />
    <Planta l={l} x={322} y={85} />
  </g>
);

/** La sala de espera: el sillón, la mesita con su lámpara, una planta, un
 *  cuadro, el revistero y el dispensador de agua. */
const pacientesIzquierda: Dibujo = (l) => (
  <g>
    <MesaIzquierda l={l} hasta={352} />
    {/* El revistero y el dispensador de agua de la sala. */}
    <ellipse cx={286} cy={105} rx={17} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={327} cy={105} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <rect x={276} y={72} width={12} height={17} rx={1} transform="rotate(-8 282 88)" {...l.p(TERRACOTA_CLARO)} />
    <rect x={285} y={70} width={12} height={19} rx={1} transform="rotate(7 291 88)" {...l.p(ACERO_CLARO)} />
    <path d="M272 84 H300 L297 104 H275 Z" {...l.p(MADERA)} />
    <rect x={318} y={30} width={18} height={24} rx={6} {...l.p(ACERO_CLARO, 0.8)} />
    <rect x={323} y={52} width={8} height={5} rx={1} {...l.p(HUESO)} />
    <rect x={314} y={56} width={26} height={48} rx={3} {...l.p(BLANCO)} />
    <rect x={322} y={65} width={10} height={5} rx={1.5} {...l.p(MARCA_MEDIO, 0.7)} />
    <rect x={320} y={80} width={14} height={3} rx={1} {...l.p(HUESO)} />
    {/* La sala, apoyada en el tablero. */}
    <g transform="translate(0 -12)">
    <ellipse cx={170} cy={116} rx={46} ry={2.6} {...l.r(TINTA, 0.06)} />
    <ellipse cx={105} cy={117} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={236} cy={117} rx={18} ry={2.2} {...l.r(TINTA, 0.06)} />
    {/* Un paisaje tranquilo: el cielo, el sol y dos lomas. */}
    <rect x={40} y={18} width={44} height={40} rx={4} {...l.p(BLANCO)} />
    <rect x={45} y={23} width={34} height={30} rx={2} {...l.p(ACERO_CLARO, 0.7)} />
    <circle cx={70} cy={32} r={4} {...l.p(TERRACOTA_CLARO, 0.9)} />
    <path d="M45 53 V44 Q53 37 61 42.5 Q69 37.5 79 43 V53 Z" {...l.p(SALVIA, 0.55)} />
    <Planta l={l} x={105} y={97} />

    {/* El sillón, vacío (dibujado en otra escala y achicado). */}
    <g transform={agrandar([196, 164], [170, 116], 0.72)}>
      <path d="M160 88 Q160 70 178 70 H214 Q232 70 232 88 V136 H160 Z" {...l.p(ACERO_CLARO)} />
      <path d="M156 128 H236 Q242 128 242 134 V146 H150 V134 Q150 128 156 128 Z" {...l.p(ACERO_CLARO)} />
      <rect x={176} y={118} width={34} height={12} rx={4} {...l.p(MARCA_CLARO)} transform="rotate(-4 193 124)" />
      <path d="M144 108 Q144 100 152 100 H158 Q164 100 164 108 V152 H144 Z" {...l.p(ACERO_CLARO)} />
      <path d="M228 108 Q228 100 236 100 H242 Q248 100 248 108 V152 H228 Z" {...l.p(ACERO_CLARO)} />
      <path d="M146 152 H246 V157 H146 Z" {...l.p(ACERO, 0.4)} />
      <path d="M150 157 v8 M242 157 v8" {...l.t()} />
    </g>

    {/* La mesita, con su lámpara. */}
    <path d="M236 74 V62" {...l.t()} />
    <path d="M223 62 H249 L243 47 H229 Z" {...l.p(HUESO)} />
    <rect x={230} y={74} width={12} height={4} rx={1.5} {...l.p(MADERA)} />
    <rect x={218} y={78} width={36} height={4} rx={1.5} {...l.p(MADERA)} />
    <path d="M222 82 V116 M250 82 V116" {...l.t()} />
    </g>
  </g>
);

// --- Documentos: la firma --------------------------------------------------

/** La mano firma la hoja con la birome; después aparece el tilde. */
const documentosDerecha: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={44} />
    {/* Una pila de hojas (el vaso con biromes pasó a la izquierda). */}
    <rect x={272} y={99} width={74} height={6} rx={1} {...l.p(BLANCO)} />
    <rect x={276} y={94} width={68} height={5} rx={1} {...l.p(MARCA_CLARO)} />

    {/* La tabla con la hoja. */}
    <rect x={56} y={8} width={94} height={100} rx={6} {...l.p(MADERA)} />
    <rect x={63} y={17} width={80} height={86} rx={2} {...l.p(BLANCO)} />
    <path d="M88 13 H118 V22 H88 Z" {...l.p(ACERO, 0.75)} />
    <path d="M97 13 Q103 7 109 13" {...l.t()} />
    <rect x={71} y={26} width={34} height={3.6} rx={1.8} {...l.r(TINTA, 0.28)} />
    <path d="M71 38 q3 -3 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0" {...l.c(ACERO_OSCURO, 1.3)} />
    <rect x={71} y={48} width={8} height={8} rx={1.6} {...l.p(BLANCO)} />
    <path d="M72.6 52 L74.8 54.4 L78.8 49.4" {...l.c(MARCA, 1.9)} />
    <path d="M84 52 H128" {...l.t()} />
    <rect x={71} y={62} width={8} height={8} rx={1.6} {...l.p(BLANCO)} />
    <path className="esc-tilde" pathLength={1} d="M72.6 66 L74.8 68.4 L78.8 63.4" {...l.c(MARCA, 1.9)} />
    <path d="M84 66 H120" {...l.t()} />
    <path d="M76 92 H136" {...l.t()} />
    <path
      className="esc-firma"
      pathLength={1}
      d="M80 88 C83 78 88 78 86 87 C85 92 90 84 94 84 C97 84 96 89 100 87 C104 85 106 82 108 85 C110 88 112 86 114 84"
      {...l.c(ACERO_OSCURO, 1.5)}
    />

    {/* La mano con la birome: la punta queda al final de la firma. */}
    <Mano l={l} x={128.4} y={86.7} giro={-70} escala={0.8} piel={PIEL.clara} manga={BLANCO} puno={HUESO} birome className="esc-firmar" />
  </g>
);

// --- Calendario: la mano que clava una notita ------------------------------

interface NotitaProps {
  l: Lapiz;
  x: number;
  y: number;
  giro: number;
  color: string;
  chinche: string;
  children?: ReactNode;
}

/** Una notita con su sombra, la esquina doblada y la chinche. */
function Notita({ l, x, y, giro, color, chinche, children }: NotitaProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro})`}>
      <path d="M-28 -24 H32 V20 L21 30 H-28 Z" {...l.r(TINTA, 0.09)} />
      <path d="M-30 -27 H30 V17 L19 28 H-30 Z" {...l.p(color)} />
      <path d="M30 17 L19 17 L19 28 Z" {...l.p(color)} />
      <path d="M30 17 L19 17 L19 28 Z" {...l.r(TINTA, 0.08)} />
      {children}
      <Chinche l={l} color={chinche} />
    </g>
  );
}

function Chinche({ l, color }: { l: Lapiz; color: string }) {
  return (
    <g>
      <circle cx={0} cy={-20} r={4.6} {...l.p(color)} />
      <circle cx={-1.5} cy={-21.6} r={1.3} {...l.r(BLANCO, 0.85)} />
    </g>
  );
}

const renglones = (l: Lapiz, anchos: number[]) => (
  <path d={anchos.map((a, i) => `M-20 ${-9 + i * 9} h${a}`).join(" ")} {...l.k(1.4, 0.5)} />
);

const calendarioDibujo: Dibujo = (l) => (
  <g>
    <rect x={-206} y={12} width={712} height={178} rx={12} {...l.p(MADERA)} />
    <rect x={-196} y={22} width={692} height={158} rx={7} {...l.p("var(--esc-corcho)")} />
    {(
      [
        [44, 40],
        [120, 108],
        [196, 160],
        [300, 40],
        [286, 96],
        [404, 168],
        [470, 124],
        [60, 150],
        [214, 108],
        [380, 52],
        [-170, 40],
        [-90, 166],
        [-20, 34],
        [-180, 120],
      ] as const
    ).map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={1.3} {...l.r(TERRACOTA, 0.3)} />
    ))}

    <Notita l={l} x={-150} y={70} giro={5} color={NOTA.celeste} chinche={TERRACOTA}>
      {renglones(l, [34, 26, 30])}
    </Notita>
    <Notita l={l} x={-112} y={142} giro={-4} color={NOTA.dorada} chinche={MARCA_MEDIO}>
      {renglones(l, [32, 36, 20])}
    </Notita>
    {/* Una foto: un paisaje. */}
    <g transform="translate(-36 98) rotate(3)">
      <path d="M-24 -28 H28 V36 H-24 Z" {...l.r(TINTA, 0.09)} />
      <rect x={-26} y={-31} width={52} height={64} rx={2} {...l.p(BLANCO)} />
      <rect x={-21} y={-26} width={42} height={42} rx={1} {...l.p(NOTA.celeste)} />
      <circle cx={9} cy={-14} r={4.4} {...l.p(NOTA.dorada)} />
      <path d="M-21 16 V3 Q-11 -7 -1 0.5 Q8 -5.5 21 3.5 V16 Z" {...l.p(NOTA.verde)} />
      <path d="M-14 24 h20" {...l.k(1.3, 0.45)} />
      <Chinche l={l} color={ACERO} />
    </g>
    <Notita l={l} x={78} y={68} giro={-6} color={NOTA.verde} chinche={TERRACOTA}>
      {renglones(l, [36, 28, 32])}
    </Notita>
    <Notita l={l} x={154} y={132} giro={5} color={NOTA.celeste} chinche={MARCA_MEDIO}>
      <circle cx={-15} cy={-5} r={4.5} {...l.k(1.4, 0.6)} />
      <path d="M-6 -5 h24 M-20 6 h34" {...l.k(1.4, 0.5)} />
    </Notita>
    <Notita l={l} x={232} y={66} giro={-3} color={NOTA.dorada} chinche={ACERO}>
      <path d="M-20 -9 l3 3 l5 -6 M-20 4 l3 3 l5 -6" {...l.k(1.5, 0.6)} />
      <path d="M-8 -7 h24 M-8 6 h18" {...l.k(1.4, 0.5)} />
    </Notita>
    <Notita l={l} x={258} y={146} giro={4} color={NOTA.lila} chinche={TERRACOTA}>
      {renglones(l, [34, 22])}
    </Notita>

    {/* La hoja del mes, con un día marcado. */}
    <g transform="translate(446 70) rotate(4)">
      <path d="M-34 -28 H38 V40 H-34 Z" {...l.r(TINTA, 0.09)} />
      <rect x={-36} y={-31} width={72} height={68} rx={3} {...l.p(BLANCO)} />
      <path d="M-36 -19 V-28 Q-36 -31 -33 -31 H33 Q36 -31 36 -28 V-19 Z" {...l.p(TERRACOTA, 0.5)} />
      <path
        d={[0, 1, 2, 3]
          .map((f) => [0, 1, 2, 3, 4].map((c) => `M${-29 + c * 13} ${-11 + f * 11} h7`).join(" "))
          .join(" ")}
        {...l.k(1.6, 0.35)}
      />
      <circle cx={9.5} cy={11} r={6.4} {...l.c(MARCA, 1.6)} />
      <Chinche l={l} color={MARCA_MEDIO} />
    </g>

    {/* La nota nueva llega con la mano, se aprieta y le aparece la chinche. */}
    <g transform="translate(352 128) rotate(-3)">
      <g className="esc-nota-llega">
        <path d="M-28 -24 H32 V20 L21 30 H-28 Z" {...l.r(TINTA, 0.09)} />
        <path d="M-30 -27 H30 V17 L19 28 H-30 Z" {...l.p(NOTA.rosa)} />
        <path d="M30 17 L19 17 L19 28 Z" {...l.p(NOTA.rosa)} />
        <path d="M30 17 L19 17 L19 28 Z" {...l.r(TINTA, 0.08)} />
        <circle cx={-12} cy={2} r={8} {...l.k(1.4, 0.6)} />
        <path d="M-12 -2.6 V2 L-8.6 4" {...l.k(1.4, 0.6)} />
        <path d="M2 -3 h18 M2 6 h12" {...l.k(1.4, 0.5)} />
        <g className="esc-chinche">
          <Chinche l={l} color={MARCA} />
        </g>
      </g>
    </g>

    {/* La mano derecha, vista desde atrás: el índice aprieta la chinche, el
        resto del puño cerrado y el pulgar abajo. Entra desde la derecha y la
        manga sale por el borde del dibujo, que la tarjeta pega a su borde. */}
    <Mano l={l} x={351} y={106} giro={-70} piel={PIEL.miel} manga={AMBO} puno={MARCA_MEDIO} className="esc-mano" />
  </g>
);

// --- Las escenas -----------------------------------------------------------

interface DefinicionDeEscena {
  izquierda: Dibujo;
  derecha: Dibujo;
  /** Cuánto dura la acción de cada viñeta, en ms. */
  accion: { izquierda: number; derecha: number };
}

const ESCENAS: Record<Exclude<SeccionDelPanel, "calendario">, DefinicionDeEscena> = {
  general: {
    izquierda: generalIzquierda,
    derecha: generalDerecha,
    accion: { izquierda: 2400, derecha: 3200 },
  },
  turnos: { izquierda: turnosIzquierda, derecha: turnosDerecha, accion: { izquierda: 2800, derecha: 3400 } },
  pacientes: { izquierda: pacientesIzquierda, derecha: pacientesDerecha, accion: { izquierda: 2400, derecha: 3000 } },
  documentos: {
    izquierda: documentosIzquierda,
    derecha: documentosDerecha,
    accion: { izquierda: 2600, derecha: 3400 },
  },
};

/** La acción del calendario es más larga: la mano se va, vuelve con la nota
 *  nueva y la clava. */
const ACCION_CALENDARIO_MS = 4300;

/** El encuadre "angosto" es la viñeta de la derecha sola, a todo el ancho. */
export type EncuadreDeEscena = "izquierda" | "derecha" | "angosto";

interface EscenaDeSeccionProps {
  seccion: Exclude<SeccionDelPanel, "calendario">;
  encuadre: EncuadreDeEscena;
  className?: string;
}

// LAS DOS VIÑETAS EN ESPEJO (pedido de la persona, 2026-10-19: "el título
// centrado y los dibujos con el mismo tamaño y la misma distancia al
// título"). Las dos de una sección miden lo mismo, y cada lienzo se recorta
// igual: 37,5 unidades de aire hacia su borde (20 px con la viñeta a 64 px
// de alto), el contenido (300 unidades; 324 en Documentos, por la mano) y
// 12 de la mesa, que sigue hacia el título; del otro lado, la mesa sale por
// el borde de la tarjeta. Así, con el título en la columna del medio de una
// grilla 1fr · auto · 1fr (`EncabezadoDeSeccion`), la distancia de cada
// dibujo al título sale igual sola. `izquierda` y `derecha` son la x donde
// empieza cada `viewBox`. Si se cambia un dibujo, se vuelve a medir
// (`getBoundingClientRect`, que cuenta los `transform` de los grupos;
// `getBBox` no).
const RECORTE: Record<Exclude<SeccionDelPanel, "calendario">, { izquierda: number; derecha: number; ancho: number }> = {
  general: { izquierda: 39.5, derecha: 14, ancho: 349.5 },
  turnos: { izquierda: 28.5, derecha: 14, ancho: 349.5 },
  pacientes: { izquierda: 2.5, derecha: 26, ancho: 349.5 },
  documentos: { izquierda: 15, derecha: 44, ancho: 373.5 },
};

/** Una viñeta de la escena de una sección (120 de alto). */
export function EscenaDeSeccion({ seccion, encuadre, className }: EscenaDeSeccionProps) {
  const escena = ESCENAS[seccion];
  const recorte = RECORTE[seccion];
  if (encuadre === "izquierda") {
    return (
      <Lienzo
        viewBox={`${recorte.izquierda} 0 ${recorte.ancho} 120`}
        dibujo={escena.izquierda}
        accionMs={escena.accion.izquierda}
        alinear="xMinYMax meet"
        ajustarAncho
        className={className}
      />
    );
  }
  return (
    <Lienzo
      viewBox={encuadre === "angosto" ? "0 0 380 120" : `${recorte.derecha} 0 ${recorte.ancho} 120`}
      ajustarAncho={encuadre !== "angosto"}
      dibujo={escena.derecha}
      accionMs={escena.accion.derecha}
      principal
      alinear={encuadre === "angosto" ? "xMidYMax meet" : "xMaxYMax meet"}
      className={className}
    />
  );
}

/**
 * El calendario. En la computadora, el tablero entero; en lo angosto, un
 * acercamiento a la mano que clava la notita (con el borde de abajo del
 * tablero), como franja arriba de todo.
 */
export function EscenaCalendario({ angosto, className }: { angosto?: boolean; className?: string }) {
  return (
    <Lienzo
      viewBox={angosto ? "225 78 295 116" : "-220 0 740 200"}
      dibujo={calendarioDibujo}
      accionMs={ACCION_CALENDARIO_MS}
      principal
      alinear="xMaxYMid meet"
      className={className}
    />
  );
}

// --- Las escenas de las tarjetas de servicio ---------------------------------

// "¿Qué necesitás hoy?" (pedido de la persona, 2026-10-19: "no tan simples,
// más cómodos, como los que ya implementamos"). Una escena chica por
// tarjeta, en el lenguaje de las de los encabezados —la línea prismática,
// los rellenos y la mesa que sale por el borde— pero de FONDO: la tarjeta la
// pone detrás del texto y le baja la opacidad. Quietas: no las maneja
// `TarjetaConEscenas`, así que ninguna pieza se anima.

export type ServicioConEscena = "agenda" | "pagina" | "equipo";

/** La agenda: el calendario de escritorio con los turnos del mes, una taza
 *  que humea y una planta. */
const servicioAgenda: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={14} />
    <ellipse cx={40} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={112} cy={106} rx={44} ry={2.6} {...l.r(TINTA, 0.06)} />
    <ellipse cx={186} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <Planta l={l} x={40} y={85} />
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
    <path d="M176 82 h20 v14 a6 6 0 0 1 -6 6 h-8 a6 6 0 0 1 -6 -6 Z" {...l.p(BLANCO)} />
    <path d="M196 86 h3 a5 5 0 0 1 0 10 h-3" {...l.t()} />
    <rect x={176} y={87} width={20} height={4} {...l.r(TERRACOTA_CLARO, 0.9)} />
    <path d="M182 76 q-3 -4 0 -8 M190 76 q-3 -4 0 -8" {...l.t()} />
    <path d={tubo([[210, 101], [240, 97]], 3.2)} {...l.p(ACERO, 0.7)} />
  </g>
);

/** La página: la notebook con la página web en pantalla, el abanico de
 *  colores para elegir el tema y una planta. */
const servicioPagina: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={14} />
    <ellipse cx={36} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={122} cy={106} rx={60} ry={2.6} {...l.r(TINTA, 0.06)} />
    <ellipse cx={214} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <Planta l={l} x={36} y={85} />
    <rect x={66} y={22} width={112} height={76} rx={6} {...l.p(BLANCO)} />
    <rect x={72} y={28} width={100} height={64} rx={3} {...l.p(ACERO_CLARO, 0.6)} />
    <path d="M72 38 V31 a3 3 0 0 1 3 -3 h94 a3 3 0 0 1 3 3 V38 Z" {...l.p(MARCA_CLARO)} />
    <circle cx={78} cy={33} r={1.4} {...l.r(TINTA, 0.35)} />
    <circle cx={83} cy={33} r={1.4} {...l.r(TINTA, 0.35)} />
    <rect x={78} y={43} width={88} height={20} rx={2} {...l.p(SALVIA_CLARO)} />
    <rect x={84} y={49} width={34} height={3.4} rx={1.7} {...l.r(TINTA, 0.3)} />
    <rect x={84} y={55} width={22} height={2.8} rx={1.4} {...l.r(TINTA, 0.18)} />
    <rect x={78} y={68} width={26} height={19} rx={2} {...l.p(BLANCO)} />
    <rect x={109} y={68} width={26} height={19} rx={2} {...l.p(NOTA.rosa, 0.9)} />
    <rect x={140} y={68} width={26} height={19} rx={2} {...l.p(NOTA.lila, 0.9)} />
    <path d="M56 98 H188 L182 104 H62 Z" {...l.p(HUESO)} />
    {(
      [
        [-20, NOTA.verde],
        [0, NOTA.dorada],
        [20, NOTA.celeste],
      ] as const
    ).map(([giro, color]) => (
      <rect key={giro} x={208} y={58} width={12} height={44} rx={3} transform={`rotate(${giro} 214 99)`} {...l.p(color)} />
    ))}
    <circle cx={214} cy={98} r={2.4} {...l.p(HUESO)} />
  </g>
);

/** El equipo, sin dibujar personas: tres credenciales colgadas de un
 *  perchero de pared, y en la mesa una planta y una pila de carpetas. */
const servicioEquipo: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={14} />
    <ellipse cx={46} cy={106} rx={22} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={210} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <rect x={26} y={88} width={40} height={8} rx={1.5} {...l.p(ACERO_CLARO)} />
    <rect x={29} y={96} width={36} height={8} rx={1.5} {...l.p(NOTA.dorada, 0.9)} />
    <Planta l={l} x={210} y={85} />
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
        <circle cx={x} cy={58} r={6} {...l.p(HUESO)} />
        <rect x={x - 9} y={68} width={18} height={3.2} rx={1.6} {...l.r(TINTA, 0.28)} />
        <rect x={x - 6} y={73.5} width={12} height={2.6} rx={1.3} {...l.r(TINTA, 0.18)} />
      </g>
    ))}
  </g>
);

// --- Las escenas de /clinicas ------------------------------------------------

// "¿Dónde trabajás hoy?" (2026-10-19, ítems 14 y 15): las mismas decisiones
// que las de servicio —objetos, sin personas, en la paleta común— para las
// tarjetas de las clínicas, las invitaciones y "Crear mi clínica".

/** La muela del cartel de un consultorio, centrada en (x, y); `s` es la
 *  escala (1 = 14 × 18). Sin `scale()`, para que la línea no engorde. */
function muela(x: number, y: number, s: number): string {
  const p = (a: number, b: number) => `${n1(x + a * s)} ${n1(y + b * s)}`;
  return `M${p(-7, -5)} C${p(-7, -9)} ${p(-3.5, -10)} ${p(-1.5, -9)} L${p(0, -8.4)} L${p(1.5, -9)} C${p(3.5, -10)} ${p(7, -9)} ${p(7, -5)} C${p(7, -1.5)} ${p(5.2, 0.5)} ${p(4.6, 4)} C${p(4.1, 7)} ${p(3.6, 9)} ${p(2.4, 9)} C${p(1, 9)} ${p(0.9, 4.5)} ${p(0, 3)} C${p(-0.9, 4.5)} ${p(-1, 9)} ${p(-2.4, 9)} C${p(-3.6, 9)} ${p(-4.1, 7)} ${p(-4.6, 4)} C${p(-5.2, 0.5)} ${p(-7, -1.5)} ${p(-7, -5)} Z`;
}

/** La vereda de la fachada: el mismo papel que la mesa (el suelo que sale
 *  por el borde derecho), en piedra en vez de madera. */
function Vereda({ l, desde }: { l: Lapiz; desde: number }) {
  return (
    <g>
      <path d={`M${desde + 6} 110 H520 V150 H${desde + 6} Z`} {...l.p(ACERO_CLARO, 0.55)} />
      <path d={`M${desde} 104 H520 V110 H${desde} Z`} {...l.p(HUESO)} />
    </g>
  );
}

/** Mi clínica: la fachada del consultorio, con su cartel, la puerta de
 *  vidrio, una ventana con toldo, otra con la persiana. Sin planta (pedido de la persona, 2026-10-19). */
const escenaClinica: Dibujo = (l) => (
  <g>
    <Vereda l={l} desde={14} />
    <ellipse cx={36} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <rect x={56} y={22} width={166} height={82} {...l.p(BLANCO)} />
    <rect x={50} y={14} width={178} height={10} rx={2} {...l.p(HUESO)} />
    <rect x={56} y={94} width={166} height={10} {...l.p(HUESO)} />
    <rect x={102} y={30} width={74} height={17} rx={3} {...l.p(MARCA_CLARO)} />
    <path d={muela(113, 38.5, 0.62)} {...l.p(BLANCO)} />
    <rect x={123} y={34.5} width={44} height={3.4} rx={1.7} {...l.r(TINTA, 0.3)} />
    <rect x={123} y={40.5} width={30} height={2.8} rx={1.4} {...l.r(TINTA, 0.18)} />
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
    <path d="M184 82 L190 77 L196 82" {...l.t()} />
    <rect x={182} y={82} width={16} height={7} rx={1.5} {...l.p(NOTA.verde)} />
  </g>
);

/** Otra clínica: la recepción, con la pantalla de los turnos del día, el
 *  timbre del mostrador, el reloj de pared (sin planta, 2026-10-19). */
const escenaRecepcion: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={14} />
    <ellipse cx={99} cy={106} rx={22} ry={2.4} {...l.r(TINTA, 0.06)} />
    <ellipse cx={164} cy={106} rx={20} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={214} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <circle cx={34} cy={42} r={14} {...l.p(BLANCO)} />
    <path d="M34 34 V42 L40 46" {...l.t()} />
    <rect x={62} y={30} width={74} height={54} rx={4} {...l.p(BLANCO)} />
    <rect x={67} y={35} width={64} height={42} rx={2} {...l.p(ACERO_CLARO, 0.6)} />
    {(
      [
        [43, NOTA.verde, 40],
        [54, NOTA.rosa, 32],
        [65, NOTA.celeste, 36],
      ] as const
    ).map(([y, color, ancho]) => (
      <g key={y}>
        <rect x={72} y={y} width={54} height={8} rx={2} {...l.p(BLANCO)} />
        <rect x={74.5} y={y + 1.5} width={5} height={5} rx={1.5} {...l.p(color)} />
        <rect x={83} y={y + 2.8} width={ancho} height={2.6} rx={1.3} {...l.r(TINTA, 0.22)} />
      </g>
    ))}
    <path d="M94 84 H104 L106 98 H92 Z" {...l.p(HUESO)} />
    <rect x={82} y={98} width={34} height={6} rx={2} {...l.p(HUESO)} />
    <path d="M150 98 a14 14 0 0 1 28 0 Z" {...l.p(ACERO, 0.55)} />
    <path d="M156 92 q4 -5 8 -6" {...l.t()} />
    <rect x={146} y={98} width={36} height={6} rx={2} {...l.p(HUESO)} />
    <rect x={162.5} y={80} width={3} height={4} rx={1} {...l.p(HUESO)} />
    <circle cx={164} cy={79} r={2.6} {...l.p(HUESO)} />
  </g>
);

/** Crear mi clínica: la maqueta del consultorio, con su cartel, y al lado
 *  los planos enrollados (sin planta, 2026-10-19). */
const escenaCrearClinica: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={14} />
    <ellipse cx={36} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={112} cy={106} rx={40} ry={2.6} {...l.r(TINTA, 0.06)} />
    <ellipse cx={198} cy={106} rx={34} ry={2.4} {...l.r(TINTA, 0.06)} />
    <rect x={76} y={64} width={72} height={40} {...l.p(BLANCO)} />
    <path d="M70 66 L112 38 L154 66 Z" {...l.p(TERRACOTA_CLARO)} />
    <path d={muela(112, 54, 0.6)} {...l.p(BLANCO)} />
    <rect x={102} y={78} width={20} height={26} rx={1.5} {...l.p(ACERO_CLARO, 0.6)} />
    <rect x={83} y={72} width={14} height={12} rx={1.5} {...l.p(ACERO_CLARO, 0.6)} />
    <rect x={127} y={72} width={14} height={12} rx={1.5} {...l.p(ACERO_CLARO, 0.6)} />
    <rect x={164} y={90} width={64} height={14} rx={7} {...l.p(ACERO_CLARO)} />
    <ellipse cx={221} cy={97} rx={3.6} ry={7} {...l.p(BLANCO)} />
    <rect x={172} y={77} width={52} height={13} rx={6.5} {...l.p(NOTA.celeste)} />
    <ellipse cx={217.5} cy={83.5} rx={3.4} ry={6.5} {...l.p(BLANCO)} />
    <path d="M186 77 V90 M190 90 V104" {...l.t()} />
  </g>
);

/** Una invitación: el sobre abierto con la tarjeta de la clínica asomando,
 *  una birome al lado (sin planta, 2026-10-19). */
const escenaInvitacion: Dibujo = (l) => (
  <g>
    <Mesa l={l} desde={14} />
    <ellipse cx={36} cy={106} rx={16} ry={2.2} {...l.r(TINTA, 0.06)} />
    <ellipse cx={122} cy={106} rx={52} ry={2.6} {...l.r(TINTA, 0.06)} />
    <path d="M72 60 L122 26 L172 60 Z" {...l.p(MARCA_CLARO)} />
    <rect x={84} y={32} width={76} height={56} rx={3} {...l.p(BLANCO)} />
    <path d={muela(97, 44, 0.66)} {...l.p(MARCA_CLARO)} />
    <rect x={107} y={40} width={42} height={3.4} rx={1.7} {...l.r(TINTA, 0.3)} />
    <rect x={107} y={46} width={28} height={2.8} rx={1.4} {...l.r(TINTA, 0.18)} />
    <rect x={92} y={56} width={60} height={2.8} rx={1.4} {...l.r(TINTA, 0.18)} />
    <path d="M72 60 V104 H172 V60 L122 88 Z" {...l.p(BLANCO)} />
    <path d="M72 104 L110 80 M172 104 L134 80" {...l.t()} />
    <circle cx={122} cy={86} r={5} {...l.p(TERRACOTA, 0.55)} />
    <path d={tubo([[188, 101], [228, 97]], 3.2)} {...l.p(ACERO, 0.7)} />
  </g>
);

/** Las escenas de /clinicas. */
export type ClinicaConEscena = "clinica" | "otra-clinica" | "crear-clinica" | "invitacion";

/** Cualquier escena de una tarjeta con dibujo (`TarjetaConDibujo`). */
export type DibujoDeTarjeta = ServicioConEscena | ClinicaConEscena;

const ESCENAS_DE_SERVICIO: Record<DibujoDeTarjeta, Dibujo> = {
  agenda: servicioAgenda,
  pagina: servicioPagina,
  equipo: servicioEquipo,
  clinica: escenaClinica,
  "otra-clinica": escenaRecepcion,
  "crear-clinica": escenaCrearClinica,
  invitacion: escenaInvitacion,
};

/** La escena de fondo de una tarjeta de servicio (280 × 120): el contenido
 *  termina a 37,5 del borde derecho y la mesa sale por él. */
export function EscenaDeServicio({ servicio, className }: { servicio: DibujoDeTarjeta; className?: string }) {
  return (
    <Lienzo
      viewBox="0 0 280 120"
      dibujo={ESCENAS_DE_SERVICIO[servicio]}
      accionMs={0}
      vueltas={2}
      alinear="xMaxYMax meet"
      className={className}
    />
  );
}
