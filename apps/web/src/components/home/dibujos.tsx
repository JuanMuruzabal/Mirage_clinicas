import type { CSSProperties, ReactNode } from "react";

// Los dibujos de la home (2026-09-27, pedido del cliente: "le faltan
// dibujos agradables, simplicidad"). Un solo estilo para todos: línea de
// tinta, rellenos cálidos y UN acento verde, como la referencia que mandó
// (dibujos en gris con un único color de acento).
//
// Son OBJETOS del día del profesional —el mate, el celular, el calendario,
// una planta— y no personas: una figura humana dibujada a mano en SVG suele
// verse torpe, y los objetos cuentan la misma historia con más carácter (el
// mate es de acá).
//
// Cada pieza es un <g> que se ubica con x/y/escala, y las escenas las
// combinan. Lo que se mueve lleva una clase `.dib-*` (app/home.css); con
// "reducir movimiento" todo queda quieto en su mejor cuadro.

const TINTA = "var(--color-grafito, #35312b)";
const PAPEL = "var(--color-marfil, #fffdf9)";
const FONDO = "var(--color-hueso, #f6f2ea)";
const SOMBRA = "var(--color-arena, #e7dfd1)";
const ACENTO = "var(--color-salvia, #6e8f72)";
const ACENTO_CLARO = "var(--color-salvia-claro, #e4ebe2)";
const ACENTO_OSCURO = "var(--color-salvia-oscuro, #3f5943)";
const ALERTA = "var(--color-terracota, #c97f5a)";
const AVISO = "var(--color-acero-oscuro, #2c4a5e)";

const TRAZO = {
  stroke: TINTA,
  strokeWidth: 2.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

function Ubicar({ x = 0, y = 0, e = 1, children }: { x?: number; y?: number; e?: number; children: ReactNode }) {
  return <g transform={`translate(${x} ${y}) scale(${e})`}>{children}</g>;
}

// ── Piezas ──────────────────────────────────────────────────────────────

/** El mate, con su bombilla y, si está caliente, el vapor. ~70 × 125. */
export function Mate({ x, y, e, vapor = true }: { x?: number; y?: number; e?: number; vapor?: boolean }) {
  return (
    <Ubicar x={x} y={y} e={e}>
      <ellipse cx="35" cy="111" rx="30" ry="5" fill={SOMBRA} />
      {/* La calabaza: panza redonda y boca angosta, no un frasco. */}
      <path
        d="M22 34 C6 42 -1 62 3 81 C7 100 24 109 35 109 C46 109 63 100 67 81 C71 62 64 42 48 34 Z"
        fill={PAPEL}
        {...TRAZO}
      />
      <path d="M14 70 C25 77 45 77 56 70" fill="none" {...TRAZO} strokeWidth={1.6} strokeOpacity={0.3} />
      <path d="M10 86 C24 94 46 94 60 86" fill="none" {...TRAZO} strokeWidth={1.6} strokeOpacity={0.3} />
      {/* La virola de metal y la yerba asomando. */}
      <path d="M19 30 H51 V38 C42 42 28 42 19 38 Z" fill={SOMBRA} {...TRAZO} />
      <ellipse cx="35" cy="30" rx="16" ry="4.5" fill={ACENTO} {...TRAZO} />
      <path d="M38 31 L52 -6 Q54 -12 60 -12 L68 -12" fill="none" {...TRAZO} strokeWidth={3} />
      {vapor && (
        <g fill="none" stroke={TINTA} strokeWidth={2.2} strokeLinecap="round" strokeOpacity={0.5}>
          <path className="dib-vapor" style={v({ "--i": 0 })} d="M22 20 C15 11 29 4 22 -6" />
          <path className="dib-vapor" style={v({ "--i": 1 })} d="M31 14 C24 4 38 -3 31 -14" />
          <path className="dib-vapor" style={v({ "--i": 2 })} d="M13 22 C8 15 18 9 13 1" />
        </g>
      )}
    </Ubicar>
  );
}

/** El celular, parado sobre su soporte. La pantalla va en `children`, en
 *  coordenadas del celular (la pantalla empieza en 8,12 y mide 76 × 150). */
export function Celular({
  x,
  y,
  e,
  vibra = false,
  children,
}: {
  x?: number;
  y?: number;
  e?: number;
  vibra?: boolean;
  children?: ReactNode;
}) {
  return (
    <Ubicar x={x} y={y} e={e}>
      <ellipse cx="46" cy="182" rx="42" ry="5" fill={SOMBRA} />
      <g className={vibra ? "dib-vibrar" : undefined}>
        <rect x="0" y="0" width="92" height="176" rx="16" fill={PAPEL} {...TRAZO} />
        <rect x="8" y="12" width="76" height="150" rx="9" fill={FONDO} />
        <rect x="36" y="4.5" width="20" height="4" rx="2" fill={TINTA} />
        {children}
      </g>
    </Ubicar>
  );
}

/** Un aviso en la pantalla del celular: el ícono de la campana y dos
 *  renglones. */
export function Aviso({ x, y, ancho = 68, clase, i = 0 }: { x: number; y: number; ancho?: number; clase?: string; i?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={clase} style={v({ "--i": i })}>
      <rect width={ancho} height="28" rx="7" fill={PAPEL} stroke={TINTA} strokeWidth={1.4} />
      <rect x="5" y="6" width="16" height="16" rx="4.5" fill={AVISO} />
      <path d="M10 17 v-3.5 a3 3 0 0 1 6 0 V17 z M12 19 h2" fill="none" stroke={PAPEL} strokeWidth={1.3} strokeLinecap="round" />
      <rect x="26" y="8" width={ancho - 34} height="4" rx="2" fill={TINTA} fillOpacity={0.75} />
      <rect x="26" y="16" width={(ancho - 34) * 0.6} height="4" rx="2" fill={TINTA} fillOpacity={0.3} />
      </g>
    </g>
  );
}

/** El calendario de escritorio. `llenos` son los casilleros tomados, que se
 *  pintan de a uno; `tildados`, los que además llevan tilde. */
export function Calendario({
  x,
  y,
  e,
  llenos = [],
  tildados = [],
}: {
  x?: number;
  y?: number;
  e?: number;
  llenos?: number[];
  tildados?: number[];
}) {
  const celdas = Array.from({ length: 12 }, (_, n) => ({ n, cx: 10 + (n % 4) * 24, cy: 34 + Math.floor(n / 4) * 21 }));
  return (
    <Ubicar x={x} y={y} e={e}>
      <ellipse cx="56" cy="102" rx="54" ry="5" fill={SOMBRA} />
      <rect x="0" y="0" width="112" height="98" rx="9" fill={PAPEL} />
      <path d="M0 22 V9 a9 9 0 0 1 9 -9 H103 a9 9 0 0 1 9 9 V22 Z" fill={ACENTO} />
      <rect x="0" y="0" width="112" height="98" rx="9" fill="none" {...TRAZO} />
      <path d="M0 22 H112" {...TRAZO} />
      <rect x="27" y="-8" width="6" height="15" rx="3" fill={TINTA} />
      <rect x="79" y="-8" width="6" height="15" rx="3" fill={TINTA} />
      {celdas.map(({ n, cx, cy }) => {
        const lleno = llenos.includes(n);
        return (
          <g key={n}>
            <rect
              className={lleno ? "dib-celda" : undefined}
              style={v({ "--i": llenos.indexOf(n) })}
              x={cx}
              y={cy}
              width="19"
              height="15"
              rx="3.5"
              fill={lleno ? ACENTO_CLARO : "none"}
              stroke={lleno ? ACENTO : TINTA}
              strokeWidth={1.4}
              strokeOpacity={lleno ? 1 : 0.28}
            />
            {tildados.includes(n) && (
              <path
                className="dib-celda"
                style={v({ "--i": llenos.indexOf(n) })}
                d={`M${cx + 5} ${cy + 7.5} l3.2 3.2 l6 -6.2`}
                fill="none"
                stroke={ACENTO_OSCURO}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        );
      })}
    </Ubicar>
  );
}

/** Una planta en su maceta. */
export function Planta({ x, y, e }: { x?: number; y?: number; e?: number }) {
  return (
    <Ubicar x={x} y={y} e={e}>
      <g className="dib-hojas">
        <path d="M24 42 C12 26 12 10 20 -2 C28 10 30 26 24 42 Z" fill={ACENTO_CLARO} {...TRAZO} />
        <path d="M24 44 C10 40 0 30 -4 16 C10 18 20 28 24 44 Z" fill={ACENTO_CLARO} {...TRAZO} />
        <path d="M25 44 C36 38 44 28 48 14 C35 18 27 28 25 44 Z" fill={ACENTO_CLARO} {...TRAZO} />
      </g>
      <ellipse cx="24" cy="80" rx="24" ry="4.5" fill={SOMBRA} />
      <path d="M4 42 H44 L39 78 H9 Z" fill={SOMBRA} {...TRAZO} />
      <path d="M2 42 H46" {...TRAZO} />
    </Ubicar>
  );
}

/** Un globo de chat, con el punto de "sin responder" si hace falta. */
export function Globo({
  x,
  y,
  ancho = 58,
  sinResponder = true,
  clase,
  i = 0,
}: {
  x: number;
  y: number;
  ancho?: number;
  sinResponder?: boolean;
  clase?: string;
  i?: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={clase} style={v({ "--i": i })}>
      <path
        d={`M10 0 H${ancho - 10} a10 10 0 0 1 10 10 V16 a10 10 0 0 1 -10 10 H14 L5 33 L7 25 A10 10 0 0 1 0 16 V10 A10 10 0 0 1 10 0 Z`}
        fill={PAPEL}
        {...TRAZO}
        strokeWidth={2}
      />
      <rect x="10" y="8" width={ancho - 22} height="3.5" rx="1.75" fill={TINTA} fillOpacity={0.6} />
      <rect x="10" y="15" width={(ancho - 22) * 0.6} height="3.5" rx="1.75" fill={TINTA} fillOpacity={0.3} />
      {sinResponder && <circle cx={ancho - 3} cy="3" r="5" fill={ALERTA} stroke={PAPEL} strokeWidth={2} />}
      </g>
    </g>
  );
}

/** La luna y dos estrellas con la forma de la textura de la marca. */
export function Noche({ x, y, e }: { x?: number; y?: number; e?: number }) {
  const estrella = (cx: number, cy: number, t: number, i: number) => (
    <g className="dib-titilar" style={v({ "--i": i })} transform={`translate(${cx} ${cy}) rotate(12)`} fill={TINTA} fillOpacity={0.35}>
      <rect x={-t} y={-t / 3.4} width={t * 2} height={t / 1.7} rx={t / 3.4} />
      <rect x={-t / 3.4} y={-t} width={t / 1.7} height={t * 2} rx={t / 3.4} />
    </g>
  );
  return (
    <Ubicar x={x} y={y} e={e}>
      <path d="M30 2 A26 26 0 1 0 54 38 A20 20 0 1 1 30 2 Z" fill={SOMBRA} {...TRAZO} />
      {estrella(72, 8, 6, 0)}
      {estrella(86, 36, 4.5, 1)}
      {estrella(-14, 44, 4, 2)}
    </Ubicar>
  );
}

/** El avioncito de papel: el link que sale del celular. */
function Avion() {
  return (
    <g>
      <path d="M0 0 L26 9 L0 18 L6 9 Z" fill={PAPEL} {...TRAZO} strokeWidth={2} />
      <path d="M6 9 H26" fill="none" {...TRAZO} strokeWidth={1.6} />
    </g>
  );
}

// ── Escenas ─────────────────────────────────────────────────────────────

function Lienzo({
  ancho = 480,
  alto = 300,
  titulo,
  className = "",
  children,
}: {
  ancho?: number;
  alto?: number;
  titulo: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      // Sin título es decorado: el texto de al lado ya lo dice todo.
      {...(titulo ? { role: "img", "aria-label": titulo } : { "aria-hidden": true })}
      className={className}
    >
      {children}
    </svg>
  );
}

/** El hero: el escritorio a la tarde, tranquilo. Los turnos le llegan al
 *  celular solos y el calendario se va llenando. */
export function EscenaEscritorio({ className }: { className?: string }) {
  return (
    <Lienzo titulo="Un escritorio tranquilo: el mate, el celular que recibe turnos y el calendario que se llena solo." className={className}>
      <circle cx="275" cy="150" r="118" fill={ACENTO_CLARO} />
      <path className="dib-trazar" pathLength={1} d="M20 276 H460" fill="none" {...TRAZO} />
      <Mate x={60} y={160} e={1.05} />
      <Celular x={176} y={82}>
        <Aviso x={12} y={30} clase="dib-aviso" i={0} />
        <Aviso x={12} y={64} clase="dib-aviso" i={1} />
        <Aviso x={12} y={98} clase="dib-aviso" i={2} />
      </Celular>
      <Calendario x={300} y={170} llenos={[1, 2, 6, 9]} tildados={[1, 6]} />
      <Planta x={424} y={190} e={0.95} />
    </Lienzo>
  );
}

/** Historia 1: las 23:04, y el celular no para. */
export function EscenaNoche({ className }: { className?: string }) {
  return (
    <Lienzo titulo="De noche, el celular sigue sonando con pedidos de turno sin responder." className={className}>
      <Noche x={70} y={34} />
      <path d="M40 272 H440" fill="none" {...TRAZO} />
      <Celular x={194} y={82} vibra>
        <text x="46" y="70" textAnchor="middle" fontSize="26" fontWeight="700" fill={TINTA} fontFamily="var(--font-mono), monospace">
          23:04
        </text>
        <rect x="26" y="80" width="40" height="4" rx="2" fill={TINTA} fillOpacity={0.25} />
      </Celular>
      <Globo x={70} y={128} clase="dib-globo" i={0} />
      <Globo x={312} y={98} ancho={66} clase="dib-globo" i={1} />
      <Globo x={98} y={196} ancho={64} clase="dib-globo" i={2} />
      <Globo x={320} y={168} clase="dib-globo" i={3} />
      <Globo x={300} y={34} ancho={52} clase="dib-globo" i={4} />
      <Mate x={392} y={172} e={0.78} vapor={false} />
    </Lienzo>
  );
}

/** Historia 2: el link sale del celular y el calendario se empieza a llenar. */
export function EscenaLink({ className }: { className?: string }) {
  return (
    <Lienzo titulo="El link sale del celular hacia el calendario, que empieza a llenarse." className={className}>
      <path d="M40 272 H440" fill="none" {...TRAZO} />
      <Celular x={70} y={82}>
        <rect x="16" y="66" width="60" height="26" rx="13" fill={PAPEL} stroke={ACENTO} strokeWidth={2} />
        <g fill="none" stroke={ACENTO_OSCURO} strokeWidth={2.2} strokeLinecap="round">
          <path d="M33 82 l-3 3 a4 4 0 0 1 -6 -6 l3 -3" />
          <path d="M35 76 l3 -3 a4 4 0 0 1 6 6 l-3 3" />
          <path d="M31 83 l6 -6" />
        </g>
        <rect x="50" y="77" width="18" height="4" rx="2" fill={TINTA} fillOpacity={0.4} />
      </Celular>
      <path
        d="M172 150 C220 70 300 60 330 120"
        fill="none"
        stroke={TINTA}
        strokeWidth={2}
        strokeDasharray="2 8"
        strokeLinecap="round"
        strokeOpacity={0.5}
      />
      <g className="dib-avion" style={v({ offsetPath: "path('M172 150 C220 70 300 60 330 120')" })}>
        <g transform="translate(-13 -9)">
          <Avion />
        </g>
      </g>
      <Calendario x={300} y={150} e={1.1} llenos={[0, 3, 5, 6, 10]} />
    </Lienzo>
  );
}

/** Historia 3: la calma. El calendario lleno, el mate caliente y un aviso. */
export function EscenaCalma({ className }: { className?: string }) {
  return (
    <Lienzo titulo="De día y con calma: el calendario lleno, el mate caliente y un aviso de turno nuevo." className={className}>
      <g className="dib-girar-lento">
        <circle cx="386" cy="70" r="26" fill={ACENTO_CLARO} stroke={ACENTO} strokeWidth={2.2} />
        {Array.from({ length: 8 }, (_, n) => {
          const a = (n * Math.PI) / 4;
          return (
            <path
              key={n}
              d={`M${386 + Math.cos(a) * 36} ${70 + Math.sin(a) * 36} L${386 + Math.cos(a) * 46} ${70 + Math.sin(a) * 46}`}
              stroke={ACENTO}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          );
        })}
      </g>
      <path d="M40 272 H440" fill="none" {...TRAZO} />
      <Calendario x={64} y={150} e={1.1} llenos={[0, 1, 2, 4, 5, 6, 8, 9, 10]} tildados={[0, 1, 2, 4, 5]} />
      <Celular x={218} y={82}>
        <Aviso x={12} y={44} clase="dib-aviso" i={0} />
      </Celular>
      <Mate x={352} y={152} e={1} />
    </Lienzo>
  );
}

// ── Dibujos chicos, para las ventajas ───────────────────────────────────

export function DibujoAgil({ className }: { className?: string }) {
  return (
    <Lienzo ancho={200} alto={150} titulo="" className={className}>
      <circle cx="100" cy="74" r="58" fill={ACENTO_CLARO} />
      <Celular x={60} y={10} e={0.72}>
        <rect x="16" y="40" width="60" height="44" rx="6" fill={PAPEL} stroke={TINTA} strokeWidth={1.6} />
        <path d="M34 62 l7 7 l15 -15" className="dib-trazar" pathLength={1} fill="none" stroke={ACENTO_OSCURO} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </Celular>
    </Lienzo>
  );
}

export function DibujoOrdenada({ className }: { className?: string }) {
  return (
    <Lienzo ancho={200} alto={150} titulo="" className={className}>
      <circle cx="100" cy="74" r="58" fill={ACENTO_CLARO} />
      <Calendario x={44} y={34} llenos={[0, 2, 5, 7, 8, 11]} tildados={[0, 5]} />
    </Lienzo>
  );
}

export function DibujoVisible({ className }: { className?: string }) {
  return (
    <Lienzo ancho={200} alto={150} titulo="" className={className}>
      <circle cx="100" cy="74" r="58" fill={ACENTO_CLARO} />
      <g transform="translate(40 30)">
        <ellipse cx="60" cy="96" rx="58" ry="5" fill={SOMBRA} />
        <rect width="120" height="88" rx="9" fill={PAPEL} {...TRAZO} />
        <path d="M0 16 H120" {...TRAZO} />
        <circle cx="10" cy="8" r="2.4" fill={TINTA} fillOpacity={0.4} />
        <circle cx="18" cy="8" r="2.4" fill={TINTA} fillOpacity={0.4} />
        <rect className="dib-portada" x="10" y="24" width="100" height="30" rx="5" fill={ACENTO} />
        <rect x="10" y="62" width="60" height="5" rx="2.5" fill={TINTA} fillOpacity={0.3} />
        <rect x="10" y="72" width="34" height="9" rx="4.5" fill={TINTA} />
      </g>
      <g transform="translate(138 84)">
        <circle cx="12" cy="12" r="12" fill={PAPEL} {...TRAZO} strokeWidth={3} />
        <path d="M21 21 L32 32" {...TRAZO} strokeWidth={4} />
      </g>
    </Lienzo>
  );
}

export function DibujoTranquila({ className }: { className?: string }) {
  return (
    <Lienzo ancho={200} alto={150} titulo="" className={className}>
      <circle cx="100" cy="74" r="58" fill={ACENTO_CLARO} />
      <Mate x={64} y={16} e={0.95} />
    </Lienzo>
  );
}
