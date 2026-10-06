"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import {
  CARAS,
  COLORES_DE_FIGURA,
  ETIQUETA_DE_COLOR,
  ladoDeCara,
  llevaProtesis,
  MARCAS_POR_LEYENDA,
  MAXIMO_DE_TRAMOS,
  nombreDeCara,
  nombreDeMarca,
  sugerirExistentes,
  textoDeOdontograma,
  type Cara,
  type LadoDeRecuadro as Lado,
  type CampoOdontograma as CampoDeOdontograma,
  type ColorOdontograma,
  type Denticion,
  type LeyendaDeOdontograma as Leyenda,
  type MarcaDePieza,
  type PiezaOdontograma,
  type TramoDeProtesis,
  type ValorOdontograma,
} from "@dental-mirage/documentos-clinicos";
import { Dialogo } from "@/components/dialogo";
import { GrupoDeOpciones } from "@/components/editor-pagina/grupo-de-opciones";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import {
  agregarTramo,
  borrarPieza,
  borrarTodo,
  conExistentes,
  extremosDe,
  filasDe,
  leerOdontograma,
  leerOperacion,
  leerPiezaEscrita,
  marcar,
  moverFoco,
  OPERACION_VACIA,
  operarProtesis,
  pintarCara,
  quitarTramo,
  soloDosDigitos,
  tramoDeLaOperacion,
  tramosEnPieza,
  type AccionDeProtesis,
  type ContextoDeProtesis,
  type FilaDelOdontograma,
  type Herramienta,
  type OperacionDeProtesis,
  type PiezaEscrita,
  type TipoDeProtesis,
  type TramoEnPieza,
} from "./odontograma-edicion";

// CampoOdontograma — el odontograma del editor de documentos (Fase 5.5).
//
// En la columna del formulario es un resumen y un botón: el control se
// abre en una pantalla emergente, donde entra la fila entera con piezas de
// 44 px (en la columna, de ~380 px, las caras quedaban de 19 px).
//
// Las piezas se dibujan como en el papel del Colegio: cada una es un
// cuadrado con sus cinco caras (cuatro trapecios y el centro), las
// permanentes arriba y abajo de la línea media, y las temporarias debajo (arriba en la leyenda pediátrica, como en la historia de odontopediatría),
// centradas. Se elige un color (rojo o azul, con lo que significa en esta
// leyenda) y una herramienta. Tocar una pieza (o Enter), o escribir su
// número en "Pieza", la SELECCIONA, con cualquier herramienta: el panel de
// debajo de las herramientas la muestra grande, con lo que tiene y lo que
// la herramienta le puede hacer:
//   - Caras: sus cinco caras grandes y con nombre; tocar una la pinta, y
//     con el mismo color la borra.
//   - Una marca (X, corona, sellador, T): el botón que la pone o la saca.
//   - Prótesis: tres pasos explícitos —Empezar, Terminar, Guardar—, con las
//     piezas tocadas o escritas en "Desde" y "Hasta".
//   - Borrador: el botón que le saca todo, también sus prótesis.
// Lo que dejaría un conflicto lógico (una prestación en una pieza ausente,
// un pilar que se va a extraer) no se aplica, y el panel dice por qué.
// Las piezas son UNA parada de Tab (foco itinerante): las flechas las
// recorren como en el papel.

const ADJETIVO: Record<ColorOdontograma, string> = { rojo: "roja", azul: "azul" };

const NOMBRE_DE_HERRAMIENTA: Record<Herramienta, string> = {
  caras: "Caras",
  x: "X",
  corona: "Corona",
  sellador: "Sellador",
  traumatizado: "T",
  fija: "Prótesis fija",
  removible: "Prótesis removible",
  borrador: "Borrador",
};

/** Lo que hace la herramienta con la pieza que se toque, antes de elegirla. */
function ayudaDe(herramienta: Herramienta): string {
  switch (herramienta) {
    case "caras":
      return "Después, tocá las caras que querés marcar.";
    case "fija":
    case "removible":
      return "Ahí empieza la prótesis; después elegís dónde termina.";
    case "borrador":
      return "Después, podés borrarle las caras, las marcas y sus prótesis.";
    default:
      return `Después, podés ponerle o sacarle ${LA_MARCA[herramienta]}.`;
  }
}

// Las referencias del papel, con sus rótulos tal cual (también sin la
// tilde de PROTESIS, como en el modelo).
const LEYENDAS = {
  general: [
    { simbolo: "rojo", texto: "COLOR ROJO Prestaciones existentes" },
    { simbolo: "azul", texto: "COLOR AZUL Prestaciones requeridas" },
    { simbolo: "x", texto: "X Diente ausente o a extraer" },
    { simbolo: "fija", texto: "PROTESIS FIJA" },
    { simbolo: "removible", texto: "PROTESIS REMOVIBLE" },
    { simbolo: "corona", texto: "CORONAS" },
  ],
  pediatrica: [
    { simbolo: "rojo", texto: "ROJO: Trabajos realizados" },
    { simbolo: "azul", texto: "AZUL: Trabajos a realizar" },
    { simbolo: "sellador", texto: "SELLADOR" },
    { simbolo: "corona", texto: "CORONAS" },
    { simbolo: "x", texto: "X: elemento a extraer, extraído o ausente" },
    { simbolo: "traumatizado", texto: "T: elemento traumatizado" },
  ],
} as const satisfies Record<Leyenda, readonly { simbolo: string; texto: string }[]>;

type Simbolo = (typeof LEYENDAS)[Leyenda][number]["simbolo"];

const PILDORA = `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${CLASE_TACTIL}`;
const claseDePildora = (elegida: boolean) =>
  `${PILDORA} ${elegida ? "border-salvia-oscuro bg-salvia-oscuro text-marfil" : "border-linea bg-hueso text-grafito hover:border-salvia"}`;

// --- Una pieza ------------------------------------------------------------

// Las cinco caras en unidades de 0 a 100: el centro mide el 42 % del lado,
// la misma proporción que las figuras que se congelan (armarFiguras).
const POLIGONO: Record<Lado, string> = {
  arriba: "0,0 100,0 71,29 29,29",
  abajo: "0,100 29,71 71,71 100,100",
  izquierda: "0,0 29,29 29,71 0,100",
  derecha: "100,0 100,100 71,71 71,29",
  centro: "29,29 71,29 71,71 29,71",
};

function MarcaSvg({ marca, color }: { marca: MarcaDePieza; color: ColorOdontograma }) {
  const trazo = { stroke: COLORES_DE_FIGURA[color], fill: "none", vectorEffect: "non-scaling-stroke" as const };
  switch (marca) {
    case "corona":
      return <circle cx={50} cy={50} r={62} strokeWidth={1.5} {...trazo} />;
    case "x":
      return (
        <>
          <line x1={8} y1={8} x2={92} y2={92} strokeWidth={2} {...trazo} />
          <line x1={92} y1={8} x2={8} y2={92} strokeWidth={2} {...trazo} />
        </>
      );
    case "sellador":
      return <polygon points="50,15 85,82 15,82" strokeWidth={1.5} {...trazo} />;
    case "traumatizado":
      return (
        <text x={50} y={78} textAnchor="middle" fontSize={80} fontFamily="Helvetica, Arial, sans-serif" fill={COLORES_DE_FIGURA[color]}>
          T
        </text>
      );
  }
}

/** El tramo de una prótesis que cruza una pieza, por su centro, como la
 *  línea que se congela: del centro al borde en los pilares, de lado a lado
 *  en el medio, y hasta la mitad del hueco con la vecina para que se toquen. */
function LineaDeProtesis({ tramo, lugar }: TramoEnPieza) {
  const afuera = "calc(var(--hueco) / -2)";
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 h-0 -translate-y-px"
      style={{
        borderTop: `2px ${tramo.tipo === "removible" ? "dashed" : "solid"} ${COLORES_DE_FIGURA[tramo.color]}`,
        left: lugar === "inicio" ? "50%" : afuera,
        right: lugar === "fin" ? "50%" : afuera,
      }}
    />
  );
}

/** Las caras y las marcas de una pieza, con su color. */
function partesDePieza(pieza: string, contenido: PiezaOdontograma | undefined, leyenda: Leyenda): string[] {
  const partes: string[] = [];
  for (const cara of CARAS) {
    const color = contenido?.caras?.[cara];
    if (color) partes.push(`cara ${nombreDeCara(cara, pieza)} ${ADJETIVO[color]}`);
  }
  for (const marca of MARCAS_POR_LEYENDA[leyenda]) {
    const color = contenido?.marcas?.[marca];
    if (color) partes.push(`${nombreDeMarca(marca, leyenda)} en ${color}`);
  }
  return partes;
}

function describirPieza(pieza: string, contenido: PiezaOdontograma | undefined, leyenda: Leyenda, enProtesis: boolean, inicio: boolean): string {
  const partes = partesDePieza(pieza, contenido, leyenda);
  if (enProtesis) partes.push("con prótesis");
  if (inicio) partes.push("inicio de la prótesis que estás marcando");
  return partes.length > 0 ? partes.join(", ") : "sin marcas";
}

function PiezaBoton({
  pieza,
  fila,
  contenido,
  tramos,
  leyenda,
  conFoco,
  esInicio,
  seleccionada,
  registrar,
  onTocar,
  onTecla,
}: {
  pieza: string;
  fila: FilaDelOdontograma;
  contenido: PiezaOdontograma | undefined;
  tramos: TramoEnPieza[];
  leyenda: Leyenda;
  conFoco: boolean;
  esInicio: boolean;
  /** La del panel de la pieza seleccionada. */
  seleccionada: boolean;
  registrar: (el: HTMLButtonElement | null) => void;
  onTocar: () => void;
  onTecla: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const idDescripcion = useId();
  const numero = (
    <span aria-hidden="true" className="font-[family-name:var(--font-mono)] text-[11px] leading-none text-grafito/75 tabular-nums">
      {pieza}
    </span>
  );

  return (
    <button
      ref={registrar}
      type="button"
      tabIndex={conFoco ? 0 : -1}
      data-autofocus={conFoco || undefined}
      aria-label={`Pieza ${pieza}`}
      aria-describedby={idDescripcion}
      data-pieza={pieza}
      onClick={onTocar}
      onKeyDown={onTecla}
      className={`relative flex w-(--lado) flex-col items-center gap-0.5 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-salvia-oscuro ${
        esInicio || seleccionada ? "ring-2 ring-salvia-oscuro" : "hover:ring-1 hover:ring-salvia"
      }`}
    >
      <span id={idDescripcion} className="sr-only">
        {describirPieza(pieza, contenido, leyenda, tramos.length > 0, esInicio)}
      </span>
      {fila.superior && numero}
      <span className="relative block h-(--lado) w-(--lado)">
        <svg viewBox="-14 -14 128 128" className="h-(--lado) w-(--lado) overflow-visible" aria-hidden="true">
          {CARAS.map((cara) => {
            const color = contenido?.caras?.[cara];
            return (
              <polygon
                key={cara}
                points={POLIGONO[ladoDeCara(cara, pieza)]}
                fill={color ? COLORES_DE_FIGURA[color] : undefined}
                className={color ? undefined : "fill-white"}
                stroke="#35312b"
                strokeWidth={1}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <g className="pointer-events-none">
            {MARCAS_POR_LEYENDA[leyenda].map((marca) => {
              const color = contenido?.marcas?.[marca];
              return color ? <MarcaSvg key={marca} marca={marca} color={color} /> : null;
            })}
          </g>
        </svg>
        {tramos.map((t) => (
          <LineaDeProtesis key={t.indice} {...t} />
        ))}
      </span>
      {!fila.superior && numero}
    </button>
  );
}

// --- La pieza seleccionada: grande, con lo que tiene y lo que se le puede hacer

const LADOS: readonly Lado[] = ["arriba", "abajo", "izquierda", "derecha", "centro"];

/** Dónde va el nombre de cada cara en el dibujo de 0 a 100 (y su color,
 *  un renglón más abajo). */
const RENGLON: Record<Lado, [number, number]> = {
  arriba: [50, 14],
  abajo: [50, 84],
  izquierda: [14.5, 49],
  derecha: [85.5, 49],
  centro: [50, 49],
};

const TAMANO_GRANDE = "size-40 shrink-0 overflow-visible sm:size-44";
/** Sin caras para tocar (las otras herramientas) la pieza es solo un dibujo:
 *  en el celular se achica y deja lugar al texto y a los botones, que en una
 *  columna de 150 px se partían en cinco renglones. */
const TAMANO_DIBUJO = "size-28 shrink-0 overflow-visible sm:size-44";

function CaraGrande({ pieza, cara, color, primera, onCara }: { pieza: string; cara: Cara; color?: ColorOdontograma; primera: boolean; onCara: (cara: Cara) => void }) {
  const lado = ladoDeCara(cara, pieza);
  const nombre = nombreDeCara(cara, pieza);
  const [x, y] = RENGLON[lado];
  return (
    <g
      role="button"
      tabIndex={0}
      data-primero={primera || undefined}
      aria-label={`Cara ${nombre}, ${color ? ADJETIVO[color] : "sin marcar"}`}
      onClick={() => onCara(cara)}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onCara(cara);
      }}
      className={`cursor-pointer outline-none [&:focus-visible>polygon]:stroke-salvia-oscuro [&:focus-visible>polygon]:stroke-[3] ${
        color ? "" : "[&:hover>polygon]:fill-salvia-claro"
      }`}
    >
      <polygon
        points={POLIGONO[lado]}
        fill={color ? COLORES_DE_FIGURA[color] : undefined}
        className={color ? undefined : "fill-white"}
        stroke="#35312b"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <text x={x} y={y} textAnchor="middle" fontSize={7} fill={color ? "#fff" : "#35312b"} className="pointer-events-none select-none">
        {nombre}
        {color && (
          <tspan x={x} dy={7.5} fontSize={6}>
            {ADJETIVO[color]}
          </tspan>
        )}
      </text>
    </g>
  );
}

/** La pieza grande. Con la herramienta Caras, sus cinco caras son botones
 *  con nombre (el camino para pintarlas); si no, es el dibujo de lo que
 *  tiene. Sin pieza, el contorno vacío. */
function DibujoGrande({
  pieza,
  contenido,
  leyenda,
  onCara,
}: {
  pieza: string | null;
  contenido: PiezaOdontograma | undefined;
  leyenda: Leyenda;
  onCara?: (cara: Cara) => void;
}) {
  const tinta = { stroke: "#35312b", strokeWidth: 1.5, strokeLinejoin: "round" as const, vectorEffect: "non-scaling-stroke" as const };
  const tamano = onCara ? TAMANO_GRANDE : TAMANO_DIBUJO;
  if (!pieza) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true" className={`${tamano} opacity-30`}>
        {LADOS.map((lado) => (
          <polygon key={lado} points={POLIGONO[lado]} fill="white" {...tinta} />
        ))}
      </svg>
    );
  }
  if (onCara) {
    return (
      <svg viewBox="0 0 100 100" role="group" aria-label={`Caras de la pieza ${pieza}`} className={TAMANO_GRANDE}>
        {CARAS.map((cara, i) => (
          <CaraGrande key={cara} pieza={pieza} cara={cara} color={contenido?.caras?.[cara]} primera={i === 0} onCara={onCara} />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="-14 -14 128 128" aria-hidden="true" className={tamano}>
      {CARAS.map((cara) => {
        const color = contenido?.caras?.[cara];
        return <polygon key={cara} points={POLIGONO[ladoDeCara(cara, pieza)]} fill={color ? COLORES_DE_FIGURA[color] : "white"} {...tinta} />;
      })}
      {MARCAS_POR_LEYENDA[leyenda].map((marca) => {
        const color = contenido?.marcas?.[marca];
        return color ? <MarcaSvg key={marca} marca={marca} color={color} /> : null;
      })}
    </svg>
  );
}

/** Cómo se nombra cada marca en sus botones. */
const MARCA_EN_BOTON: Record<MarcaDePieza, string> = { x: "X", corona: "corona", sellador: "sellador", traumatizado: "T" };
const LA_MARCA: Record<MarcaDePieza, string> = { x: "la X", corona: "la corona", sellador: "el sellador", traumatizado: "la T" };

const BOTON_DE_ACCION = "min-h-11 self-start rounded-full bg-salvia-oscuro px-4 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-50";
// Mismo alto y mismo relleno que el de acción: van de a pares (Guardar y
// Cancelar, Sí y No) y uno más bajo al lado del otro se ve de otra familia.
export const BOTON_SECUNDARIO = "min-h-11 rounded-full border border-linea bg-hueso px-4 text-sm font-medium hover:bg-arena disabled:opacity-50";
// La confirmación de algo que no se deshace, como "Confirmacion" con peligro.
const BOTON_DE_PELIGRO = "min-h-11 rounded-full bg-terracota-oscuro px-4 text-sm font-semibold text-marfil hover:brightness-95";
// Un campo de esta pantalla mide lo mismo que los botones de su fila.
const CAMPO_CORTO = "min-h-11 w-20 rounded-field border border-linea bg-hueso px-3 py-2 text-[15px] text-grafito tabular-nums outline-none focus:border-salvia";

/** Poner o sacar una marca en la pieza. Si chocaría con lo que la pieza
 *  tiene, no se ofrece: se dice por qué (y, para la X, cómo hacerlo). */
function OpcionesDeMarca({
  pieza,
  marca,
  color,
  actual,
  onCambio,
}: {
  pieza: string;
  marca: MarcaDePieza;
  color: ColorOdontograma;
  actual: ValorOdontograma;
  onCambio: (valor: ValorOdontograma | undefined) => void;
}) {
  const idMotivo = useId();
  const resultado = marcar(actual, pieza, marca, color);
  const puesta = actual.piezas?.[pieza]?.marcas?.[marca] === color;
  const etiqueta = puesta ? `Sacar ${MARCA_EN_BOTON[marca]}` : `Marcar ${MARCA_EN_BOTON[marca]} en ${color}`;
  if (resultado.tipo === "aplicada") {
    return (
      <button type="button" data-primero onClick={() => onCambio(resultado.valor)} className={BOTON_DE_ACCION}>
        {etiqueta}
      </button>
    );
  }
  const { resolver } = resultado;
  return (
    <>
      <p id={idMotivo} className="text-sm text-terracota-oscuro">
        {resultado.mensaje}
      </p>
      {resolver ? (
        <button type="button" data-primero onClick={() => onCambio(resolver.valor)} className={BOTON_DE_ACCION}>
          {resolver.etiqueta}
        </button>
      ) : (
        <button type="button" disabled aria-describedby={idMotivo} className={BOTON_DE_ACCION}>
          {etiqueta}
        </button>
      )}
    </>
  );
}

/** Lo que tiene una pieza, para el panel: caras, marcas y prótesis. */
function loQueTiene(pieza: string, contenido: PiezaOdontograma | undefined, leyenda: Leyenda, tramos: TramoEnPieza[]) {
  const partes = partesDePieza(pieza, contenido, leyenda);
  for (const { tramo, lugar } of tramos) {
    const [a, b] = extremosDe(tramo);
    partes.push(`${lugar === "medio" ? "en" : "pilar de"} la prótesis ${tramo.tipo} en ${tramo.color}, de ${a} a ${b}`);
  }
  return partes.length > 0 ? `Tiene: ${partes.join("; ")}.` : "No tiene nada marcado.";
}

/** El panel de la pieza seleccionada, debajo de las herramientas: la pieza
 *  grande, lo que tiene y lo que la herramienta elegida le puede hacer. */
function PanelDePieza({
  panel,
  pieza,
  contenido,
  leyenda,
  tramos,
  herramienta,
  aviso,
  onCara,
  children,
}: {
  panel: RefObject<HTMLElement | null>;
  pieza: string | null;
  contenido: PiezaOdontograma | undefined;
  leyenda: Leyenda;
  tramos: TramoEnPieza[];
  herramienta: Herramienta;
  aviso: string | null;
  onCara: (cara: Cara) => void;
  children: ReactNode;
}) {
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label={pieza ? `Pieza ${pieza} seleccionada` : "Pieza seleccionada"}
      className="flex min-h-48 items-start gap-4 rounded-card border border-linea bg-marfil p-4 outline-none focus-visible:ring-2 focus-visible:ring-salvia-oscuro sm:min-h-52"
    >
      <DibujoGrande pieza={pieza} contenido={contenido} leyenda={leyenda} onCara={herramienta === "caras" ? onCara : undefined} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-grafito">
        {pieza ? (
          <>
            <p className="font-medium">{herramienta === "caras" ? `Pieza ${pieza} — tocá las caras que querés marcar` : `Pieza ${pieza}`}</p>
            <p className="text-pretty text-grafito/75">{loQueTiene(pieza, contenido, leyenda, tramos)}</p>
            {children}
          </>
        ) : (
          <p className="text-grafito/75">Seleccioná el número de la pieza o tocala en el odontograma. {ayudaDe(herramienta)}</p>
        )}
        <p aria-live="polite" className="text-pretty empty:hidden">
          {aviso}
        </p>
      </div>
    </section>
  );
}

// --- Elegir por número y la prótesis en pasos -----------------------------

/** Un número de pieza escrito a mano. El error es el de un número que no
 *  es de la dentición: el de una pieza que no sirve lo dice el panel. */
function CampoDePieza({ etiqueta, texto, error, onTexto }: { etiqueta: string; texto: string; error: string | null; onTexto: (texto: string) => void }) {
  const id = useId();
  const idError = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-grafito">
        {etiqueta}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={texto}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        onChange={(e) => onTexto(soloDosDigitos(e.target.value))}
        className={CAMPO_CORTO}
      />
      {error && (
        <p id={idError} className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}
    </div>
  );
}

/** El error de un número que no es de la dentición (va debajo del campo)
 *  y el de una pieza que no sirve para la prótesis (va en el panel). */
const ajena = (p: PiezaEscrita) => (p.pieza ? null : p.error);
const conflicto = (p: PiezaEscrita) => (p.pieza ? p.error : null);

function Motivo({ id, texto }: { id: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <p id={id} className="text-sm text-terracota-oscuro">
      {texto}
    </p>
  );
}

/** Lo que el panel ofrece en cada paso de la prótesis. Cada motivo sale una
 *  sola vez, junto al botón que apaga. */
function PasosDeProtesis({
  op,
  lectura,
  tramo,
  onOperar,
  onGuardar,
}: {
  op: OperacionDeProtesis;
  lectura: { desde: PiezaEscrita; hasta: PiezaEscrita };
  tramo: TramoDeProtesis;
  onOperar: (accion: AccionDeProtesis) => void;
  onGuardar: () => void;
}) {
  const idMotivo = useId();
  const { desde, hasta } = lectura;
  const cancelar = (
    <button type="button" onClick={() => onOperar({ tipo: "cancelar" })} className={`${BOTON_SECUNDARIO} self-start text-grafito`}>
      Cancelar
    </button>
  );

  if (op.paso === "inicio") {
    const motivo = conflicto(desde);
    return (
      <>
        <Motivo id={idMotivo} texto={motivo} />
        <button
          type="button"
          data-primero
          disabled={motivo !== null}
          aria-describedby={motivo ? idMotivo : undefined}
          onClick={() => onOperar({ tipo: "empezar" })}
          className={BOTON_DE_ACCION}
        >
          Empezar en la pieza {desde.pieza}
        </button>
        {/* "Hasta" escrito antes de empezar, que no sirve: si no, el atajo no
            saltaría a confirmar y nada diría por qué. */}
        {!motivo && <Motivo id={`${idMotivo}-hasta`} texto={conflicto(hasta)} />}
      </>
    );
  }

  const motivo = conflicto(desde) ?? conflicto(hasta);
  if (op.paso === "fin") {
    const listo = motivo === null && hasta.pieza !== null;
    return (
      <>
        <p>Empieza en la pieza {desde.pieza}. Tocá la pieza donde termina, o escribila en «Hasta».</p>
        <Motivo id={idMotivo} texto={motivo} />
        <button
          type="button"
          data-primero
          disabled={!listo}
          aria-describedby={motivo ? idMotivo : undefined}
          onClick={() => onOperar({ tipo: "terminar" })}
          className={BOTON_DE_ACCION}
        >
          Terminar en la pieza {hasta.pieza ?? "…"}
        </button>
        {cancelar}
      </>
    );
  }

  const [a, b] = extremosDe(tramo);
  return (
    <>
      <p className="font-medium">
        Prótesis {tramo.tipo} en {tramo.color}, de {a} a {b}
      </p>
      <Motivo id={idMotivo} texto={motivo} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-primero
          disabled={motivo !== null}
          aria-describedby={motivo ? idMotivo : undefined}
          onClick={onGuardar}
          className={BOTON_DE_ACCION}
        >
          Guardar
        </button>
        {cancelar}
      </div>
    </>
  );
}

/** La pieza que muestra el panel en cada paso de la prótesis. */
function piezaDeLaOperacion(op: OperacionDeProtesis, { desde, hasta }: { desde: PiezaEscrita; hasta: PiezaEscrita }): string | null {
  if (op.paso === "inicio") return desde.pieza;
  if (op.paso === "fin") return hasta.pieza ?? desde.pieza;
  return hasta.pieza;
}

// --- La leyenda y los tramos ----------------------------------------------

function SimboloDeLeyenda({ simbolo }: { simbolo: Simbolo }) {
  const tinta = { stroke: "#35312b", fill: "none", strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 flex-shrink-0" aria-hidden="true">
      {simbolo === "rojo" || simbolo === "azul" ? (
        <rect x={6} y={2} width={12} height={12} rx={2} fill={COLORES_DE_FIGURA[simbolo]} />
      ) : simbolo === "x" ? (
        <path d="M7 3 17 13M17 3 7 13" {...tinta} />
      ) : simbolo === "corona" ? (
        <circle cx={12} cy={8} r={6} {...tinta} />
      ) : simbolo === "sellador" ? (
        <path d="M12 2 18 14H6Z" {...tinta} />
      ) : simbolo === "traumatizado" ? (
        <text x={12} y={13} textAnchor="middle" fontSize={13} fontWeight={600} fill="#35312b">
          T
        </text>
      ) : (
        // La prótesis es una línea por el centro de las piezas (TR-192): continua la fija, de trazos la removible.
        <path d="M2 8H22" {...tinta} strokeDasharray={simbolo === "removible" ? "3 2" : undefined} />
      )}
    </svg>
  );
}

function Referencias({ leyenda }: { leyenda: Leyenda }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <p id={id} className="text-xs font-medium tracking-wide text-grafito/75 uppercase">
        Referencias
      </p>
      <ul aria-labelledby={id} className="grid grid-cols-1 gap-1.5 text-xs text-grafito sm:grid-cols-2">
        {LEYENDAS[leyenda].map((r) => (
          <li key={r.texto} className="flex items-center gap-2">
            <SimboloDeLeyenda simbolo={r.simbolo} />
            {r.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- El control: lo que va adentro de la pantalla emergente ----------------

/** "Borrar todo", con su confirmación en el mismo lugar: sin otro diálogo
 *  encima del odontograma (o del dibujo, que la reusa). */
export function BorrarTodo({
  habilitado,
  onBorrar,
  pregunta = "¿Borrar todo el odontograma?",
  antes,
}: {
  habilitado: boolean;
  onBorrar: () => void;
  pregunta?: string;
  /** Los botones que van a su izquierda, en la misma fila (Deshacer, en el
   *  dibujo): adentro de su caja, así la pregunta pasa sola al renglón de
   *  abajo en el celular y no se los lleva. */
  antes?: ReactNode;
}) {
  const [preguntando, setPreguntando] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const no = useRef<HTMLButtonElement>(null);
  const herramientas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (preguntando) no.current?.focus();
  }, [preguntando]);

  function responder(si: boolean) {
    setPreguntando(false);
    // Con todo borrado "Borrar todo" queda deshabilitado y no puede tener el
    // foco: va a la caja de las herramientas, para no caer en <body>.
    if (si) {
      onBorrar();
      herramientas.current?.focus();
    } else boton.current?.focus();
  }

  return (
    <div
      ref={herramientas}
      tabIndex={-1}
      className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-field outline-none focus-visible:ring-2 focus-visible:ring-salvia-oscuro focus-visible:ring-offset-2 focus-visible:ring-offset-marfil"
    >
      {antes}
      <button
        ref={boton}
        type="button"
        aria-expanded={preguntando}
        disabled={!habilitado}
        onClick={() => setPreguntando(true)}
        className={`${BOTON_SECUNDARIO} text-terracota-oscuro`}
      >
        Borrar todo
      </button>
      {preguntando && (
        <div role="group" aria-label="Confirmar" className="flex flex-wrap items-center gap-2 text-sm text-grafito">
          <span>{pregunta}</span>
          <button type="button" onClick={() => responder(true)} className={`${BOTON_DE_PELIGRO} min-w-16`}>
            Sí
          </button>
          <button ref={no} type="button" onClick={() => responder(false)} className={`${BOTON_SECUNDARIO} min-w-16 text-grafito`}>
            No
          </button>
        </div>
      )}
    </div>
  );
}

/** Las piezas, como en el papel. Se desplaza de costado en su propia caja,
 *  centrado cuando entra (`w-max mx-auto`, TR-180). */
function Diagrama({
  filas,
  leyenda,
  actual,
  foco,
  inicio,
  seleccionada,
  registrar,
  onTocar,
  onTecla,
}: {
  filas: FilaDelOdontograma[];
  leyenda: Leyenda;
  actual: ValorOdontograma;
  foco: string;
  inicio: string | null;
  seleccionada: string | null;
  registrar: (pieza: string, el: HTMLButtonElement | null) => void;
  onTocar: (pieza: string) => void;
  onTecla: (pieza: string, e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div data-scroll-piezas className="-mx-1 min-w-0 overflow-x-auto overscroll-x-contain pb-2">
      <div className="mx-auto flex w-max flex-col gap-6 px-1 py-2 [--hueco:6px] [--lado:2.75rem]">
        {filas.map((fila, f) => {
          const mitad = fila.piezas.length / 2;
          const separada = f % 2 === 1;
          return (
            <div
              key={fila.id}
              className={`mx-auto flex gap-(--hueco) ${separada ? "relative before:absolute before:inset-x-0 before:-top-3 before:h-px before:bg-grafito/30" : ""}`}
            >
              {fila.piezas.map((pieza, i) => (
                <div
                  key={pieza}
                  className={
                    i === mitad
                      ? "relative before:absolute before:inset-y-0 before:left-[calc(var(--hueco)/-2)] before:w-px before:bg-grafito/30"
                      : undefined
                  }
                >
                  <PiezaBoton
                    pieza={pieza}
                    fila={fila}
                    contenido={actual.piezas?.[pieza]}
                    tramos={tramosEnPieza(filas, actual.protesis, pieza)}
                    leyenda={leyenda}
                    conFoco={pieza === foco}
                    esInicio={pieza === inicio}
                    seleccionada={pieza === seleccionada}
                    registrar={(el) => registrar(pieza, el)}
                    onTocar={() => onTocar(pieza)}
                    onTecla={(e) => onTecla(pieza, e)}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListaDeProtesis({ tramos, onQuitar }: { tramos: TramoDeProtesis[]; onQuitar: (indice: number) => void }) {
  if (tramos.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium tracking-wide text-grafito/75 uppercase">Prótesis</p>
      <ul className="flex flex-col gap-1.5">
        {tramos.map((t, i) => {
          const [a, b] = extremosDe(t);
          const nombre = `Prótesis ${t.tipo} en ${t.color}, de ${a} a ${b}`;
          return (
            <li key={`${t.tipo}-${a}-${b}`} className="flex items-center justify-between gap-3 text-sm text-grafito">
              <span className="flex items-center gap-2 text-pretty">
                <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORES_DE_FIGURA[t.color] }} />
                {nombre}
              </span>
              <button
                type="button"
                aria-label={`Quitar: ${nombre}`}
                onClick={() => onQuitar(i)}
                className={`rounded-full px-3 py-1 text-sm font-medium text-terracota-oscuro hover:bg-arena ${CLASE_TACTIL}`}
              >
                Quitar
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DientesExistentes({
  total,
  actual,
  onCambio,
}: {
  total: number;
  actual: ValorOdontograma;
  onCambio: (valor: ValorOdontograma | undefined) => void;
}) {
  const id = useId();
  const sugerido = sugerirExistentes(actual);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label htmlFor={id} className="text-sm font-medium text-grafito">
        Cantidad de dientes existentes
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={total}
        step={1}
        value={actual.existentes ?? ""}
        onChange={(e) => onCambio(conExistentes(actual, e.target.value === "" ? undefined : Number(e.target.value)))}
        className={CAMPO_CORTO}
      />
      <span className="text-xs text-grafito/75">Sugerido: {sugerido}</span>
      <button
        type="button"
        onClick={() => onCambio(conExistentes(actual, sugerido))}
        disabled={actual.existentes === sugerido}
        className={`${BOTON_SECUNDARIO} text-salvia-oscuro`}
      >
        Usar
      </button>
    </div>
  );
}

export function ControlDeOdontograma({
  campo,
  valor,
  onCambio,
}: {
  campo: Pick<CampoDeOdontograma, "denticion" | "leyenda" | "existentes">;
  valor: unknown;
  onCambio: (valor: ValorOdontograma | undefined) => void;
}) {
  const { leyenda } = campo;
  const denticion: Denticion = campo.denticion ?? "ambas";
  const actual = leerOdontograma(valor);
  const filas = filasDe(denticion, campo.leyenda === "pediatrica");
  const herramientas: Herramienta[] = [
    "caras",
    ...MARCAS_POR_LEYENDA[leyenda],
    ...(llevaProtesis(leyenda) ? (["fija", "removible"] as const) : []),
    "borrador",
  ];

  const [color, setColor] = useState<ColorOdontograma>("rojo");
  const [herramienta, setHerramienta] = useState<Herramienta>("caras");
  const [foco, setFoco] = useState<string>(filas[0].piezas[0]);
  // Con las marcas: la pieza del panel y lo escrito en "Pieza". Con la
  // prótesis, las dos salen de la operación.
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [textoPieza, setTextoPieza] = useState("");
  const [op, setOp] = useState<OperacionDeProtesis>(OPERACION_VACIA);
  const [aviso, setAviso] = useState<string | null>(null);
  // Cada selección y cada cambio de paso llevan el foco al panel: un
  // contador, para que tocar de nuevo la misma pieza también lo haga.
  const [enfoques, setEnfoques] = useState(0);
  const botones = useRef(new Map<string, HTMLButtonElement>());
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (enfoques === 0) return;
    const nodo = panel.current;
    (nodo?.querySelector<HTMLElement | SVGElement>("[data-primero]:not(:disabled)") ?? nodo)?.focus({ preventScroll: true });
  }, [enfoques]);

  const tipo: TipoDeProtesis | null = herramienta === "fija" || herramienta === "removible" ? herramienta : null;
  const ctx: ContextoDeProtesis | null = tipo ? { valor: actual, denticion, tipo, color } : null;
  const lectura = ctx ? leerOperacion(op, ctx) : null;
  const piezaDelPanel = lectura ? piezaDeLaOperacion(op, lectura) : seleccionada;
  const enfocarPanel = () => setEnfoques((n) => n + 1);

  /** Cambiar de herramienta deja la pieza seleccionada: con la prótesis,
   *  como su inicio. */
  function elegirHerramienta(h: Herramienta) {
    const pieza = piezaDelPanel;
    setHerramienta(h);
    setSeleccionada(pieza);
    setTextoPieza(pieza ?? "");
    setOp(pieza && (h === "fija" || h === "removible") ? { ...OPERACION_VACIA, desde: pieza } : OPERACION_VACIA);
    setAviso(null);
  }

  function operar(accion: AccionDeProtesis) {
    if (!ctx) return;
    const nueva = operarProtesis(op, accion, ctx);
    setOp(nueva);
    setAviso(null);
    if (nueva.paso !== op.paso) enfocarPanel();
  }

  /** Lleva el foco itinerante del diagrama a la pieza elegida. */
  function apuntar(pieza: string | null) {
    if (pieza) setFoco(pieza);
  }

  /** Tocar una pieza la selecciona, con cualquier herramienta. Con la
   *  prótesis completa el campo del paso: nunca arma nada solo. */
  function tocar(pieza: string) {
    apuntar(pieza);
    setAviso(null);
    enfocarPanel();
    if (ctx) return setOp(operarProtesis(op, { tipo: "tocar", pieza }, ctx));
    setSeleccionada(pieza);
    setTextoPieza(pieza);
  }

  /** Escribir el número selecciona la pieza como un toque, sin sacar el
   *  foco del campo (se está escribiendo). */
  function escribirPieza(texto: string) {
    const { pieza } = leerPiezaEscrita(texto, denticion);
    setTextoPieza(texto);
    setSeleccionada(pieza);
    apuntar(pieza);
    setAviso(null);
  }

  function escribirExtremo(extremo: "desde" | "hasta", texto: string) {
    apuntar(leerPiezaEscrita(texto, denticion).pieza);
    operar({ tipo: "escribir", campo: extremo, texto });
  }

  function guardarProtesis() {
    if (!ctx) return;
    const tramo = tramoDeLaOperacion(op, ctx);
    const nuevo = agregarTramo(actual, tramo);
    if ((nuevo?.protesis?.length ?? 0) > MAXIMO_DE_TRAMOS) {
      setAviso(`Hay ${MAXIMO_DE_TRAMOS} prótesis marcadas: quitá una para sumar otra.`);
      return;
    }
    const [a, b] = extremosDe(tramo);
    onCambio(nuevo);
    setOp(OPERACION_VACIA);
    setAviso(`Prótesis ${tramo.tipo} en ${tramo.color}, de ${a} a ${b}.`);
    enfocarPanel();
  }

  function alTeclear(pieza: string, e: KeyboardEvent<HTMLButtonElement>) {
    const destino = moverFoco(filas, pieza, e.key);
    if (!destino) return;
    e.preventDefault();
    setFoco(destino);
    botones.current.get(destino)?.focus();
  }

  /** Escape deshace el paso de la prótesis, o vuelve del panel a la pieza
   *  del diagrama. preventDefault: el diálogo no se cierra con ese Escape. */
  function alEscape(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    if (ctx && op.paso !== "inicio") operar({ tipo: "retroceder" });
    else if (piezaDelPanel && panel.current?.contains(e.target as Node)) botones.current.get(piezaDelPanel)?.focus();
    else return;
    e.preventDefault();
  }

  function registrar(pieza: string, el: HTMLButtonElement | null) {
    if (el) botones.current.set(pieza, el);
    else botones.current.delete(pieza);
  }

  function pintar(pieza: string, cara: Cara) {
    const resultado = pintarCara(actual, pieza, cara, color);
    setAviso(resultado.tipo === "conflicto" ? resultado.mensaje : null);
    if (resultado.tipo === "aplicada") onCambio(resultado.valor);
  }

  function borrarLaPieza(pieza: string) {
    onCambio(borrarPieza(actual, pieza));
    setAviso(`Borrada la pieza ${pieza}`);
  }

  function borrarElOdontograma() {
    onCambio(borrarTodo(actual));
    setOp(OPERACION_VACIA);
    setAviso("Se borró el odontograma.");
    botones.current.get(foco)?.focus();
  }

  const tramos = actual.protesis ?? [];
  const hayMarcas = Object.keys(actual.piezas ?? {}).length > 0 || tramos.length > 0;
  const contenido = piezaDelPanel ? actual.piezas?.[piezaDelPanel] : undefined;
  const tramosDelPanel = piezaDelPanel ? tramosEnPieza(filas, tramos, piezaDelPanel) : [];

  function opcionesDeLaHerramienta(pieza: string) {
    if (ctx && lectura) {
      return <PasosDeProtesis op={op} lectura={lectura} tramo={tramoDeLaOperacion(op, ctx)} onOperar={operar} onGuardar={guardarProtesis} />;
    }
    if (herramienta === "caras" || herramienta === "fija" || herramienta === "removible") return null;
    if (herramienta === "borrador") {
      const tieneAlgo = contenido !== undefined || tramosDelPanel.length > 0;
      return (
        <button type="button" data-primero disabled={!tieneAlgo} onClick={() => borrarLaPieza(pieza)} className={BOTON_DE_ACCION}>
          Borrar la pieza {pieza}
        </button>
      );
    }
    return <OpcionesDeMarca pieza={pieza} marca={herramienta} color={color} actual={actual} onCambio={onCambio} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" onKeyDown={alEscape}>
      <GrupoDeOpciones
        etiqueta="Color"
        opciones={(["rojo", "azul"] as const).map((c) => ({
          valor: c,
          contenido: (
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORES_DE_FIGURA[c] }} />
              {ETIQUETA_DE_COLOR[leyenda][c]}
            </span>
          ),
        }))}
        valor={color}
        onCambio={(c) => setColor(c as ColorOdontograma)}
        className="flex flex-wrap gap-2"
        claseOpcion={claseDePildora}
      />
      <GrupoDeOpciones
        etiqueta="Herramienta"
        opciones={herramientas.map((h) => ({ valor: h, contenido: NOMBRE_DE_HERRAMIENTA[h] }))}
        valor={herramienta}
        onCambio={(h) => elegirHerramienta(h as Herramienta)}
        className="flex flex-wrap gap-2"
        claseOpcion={claseDePildora}
      />

      {lectura ? (
        <div className="flex flex-wrap items-start gap-4">
          <CampoDePieza etiqueta="Desde" texto={op.desde} error={ajena(lectura.desde)} onTexto={(t) => escribirExtremo("desde", t)} />
          <CampoDePieza etiqueta="Hasta" texto={op.hasta} error={ajena(lectura.hasta)} onTexto={(t) => escribirExtremo("hasta", t)} />
        </div>
      ) : (
        <CampoDePieza etiqueta="Pieza" texto={textoPieza} error={leerPiezaEscrita(textoPieza, denticion).error} onTexto={escribirPieza} />
      )}

      {/* Arriba del diagrama y con su alto reservado desde el principio: si
          apareciera con el primer toque, correría las piezas debajo del dedo. */}
      <PanelDePieza
        panel={panel}
        pieza={piezaDelPanel}
        contenido={contenido}
        leyenda={leyenda}
        tramos={tramosDelPanel}
        herramienta={herramienta}
        aviso={aviso}
        onCara={(cara) => piezaDelPanel && pintar(piezaDelPanel, cara)}
      >
        {piezaDelPanel && opcionesDeLaHerramienta(piezaDelPanel)}
      </PanelDePieza>

      <Diagrama
        filas={filas}
        leyenda={leyenda}
        actual={actual}
        foco={foco}
        inicio={lectura && op.paso !== "inicio" ? lectura.desde.pieza : null}
        seleccionada={piezaDelPanel}
        registrar={registrar}
        onTocar={tocar}
        onTecla={alTeclear}
      />

      <BorrarTodo habilitado={hayMarcas} onBorrar={borrarElOdontograma} />

      <ListaDeProtesis tramos={tramos} onQuitar={(i) => onCambio(quitarTramo(actual, i))} />

      {campo.existentes && <DientesExistentes total={filas.reduce((n, f) => n + f.piezas.length, 0)} actual={actual} onCambio={onCambio} />}

      <Referencias leyenda={leyenda} />
    </div>
  );
}

// --- El campo, en la columna del formulario --------------------------------

export function CampoOdontograma({
  campo,
  valor,
  onCambio,
  id,
  etiquetaId,
  describedBy,
  abierto,
  onAbierto,
}: {
  campo: CampoDeOdontograma;
  valor: unknown;
  onCambio: (valor: ValorOdontograma | undefined) => void;
  /** El id del botón que abre la pantalla emergente: el editor lleva ahí
   *  el foco como a cualquier otro campo. */
  id: string;
  etiquetaId: string;
  describedBy?: string;
  /** La pantalla emergente, si la maneja el editor (que la abre al tocar
   *  el odontograma en la hoja o ante un error al terminar). */
  abierto?: boolean;
  onAbierto?: (abierto: boolean) => void;
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const estaAbierto = abierto ?? abiertoPropio;
  const cambiarAbierto = onAbierto ?? setAbiertoPropio;
  const idResumen = useId();
  const resumen = textoDeOdontograma(campo, leerOdontograma(valor)) || "Sin marcar";

  return (
    <div role="group" aria-labelledby={etiquetaId} aria-describedby={describedBy} className="flex min-w-0 flex-col items-start gap-2">
      <p id={idResumen} className="line-clamp-4 text-sm text-pretty text-grafito/75">
        {resumen}
      </p>
      <button
        id={id}
        type="button"
        aria-describedby={idResumen}
        onClick={() => cambiarAbierto(true)}
        className="min-h-11 rounded-full border border-salvia-oscuro bg-marfil px-4 text-sm font-medium text-salvia-oscuro hover:bg-salvia-claro"
      >
        Abrir odontograma
      </button>
      {estaAbierto && (
        <Dialogo
          titulo={campo.etiqueta}
          descripcion="Lo que marques se guarda solo, como el resto del documento."
          ancho="completo"
          superficie="marfil"
          onCerrar={() => cambiarAbierto(false)}
          // En el pie, fuera del scroll: en el celular el control mide más de
          // una pantalla y "Listo" quedaba al final de todo.
          pie={
            <button
              type="button"
              onClick={() => cambiarAbierto(false)}
              className="min-h-11 rounded-full bg-salvia-oscuro px-6 text-sm font-semibold text-marfil hover:brightness-95"
            >
              Listo
            </button>
          }
        >
          <div className="p-4 sm:p-6">
            <ControlDeOdontograma campo={campo} valor={valor} onCambio={onCambio} />
          </div>
        </Dialogo>
      )}
    </div>
  );
}
