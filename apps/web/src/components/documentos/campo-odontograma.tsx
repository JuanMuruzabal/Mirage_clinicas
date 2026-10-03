"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
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
  type Cara,
  type LadoDeRecuadro as Lado,
  type CampoOdontograma as CampoDeOdontograma,
  type ColorOdontograma,
  type LeyendaDeOdontograma as Leyenda,
  type MarcaDePieza,
  type PiezaOdontograma,
  type TramoDeProtesis,
  type ValorOdontograma,
} from "@dental-mirage/documentos-clinicos";
import { GrupoDeOpciones } from "@/components/editor-pagina/grupo-de-opciones";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";
import {
  agregarTramo,
  alternarCara,
  alternarMarca,
  cerrarTramo,
  conExistentes,
  filasDe,
  leerOdontograma,
  moverFoco,
  quitarTramo,
  tramosEnPieza,
  type FilaDelOdontograma,
  type Herramienta,
  type TramoEnPieza,
} from "./odontograma-edicion";

// CampoOdontograma — el odontograma del editor de documentos (Fase 5.5).
//
// Las piezas se dibujan como en el papel del Colegio: cada una es un
// cuadrado con sus cinco caras (cuatro trapecios y el centro), las
// permanentes arriba y abajo de la línea media, y las temporarias debajo,
// centradas. Se elige un color (rojo o azul, con lo que significa en esta
// leyenda) y una herramienta:
//   - Caras: tocar una cara la pinta; tocarla de nuevo con el mismo color
//     la borra, con el otro la cambia. Tocar la pieza fuera de las caras (o
//     Enter desde el teclado) abre la lista de sus cinco caras con nombre:
//     es el camino del teclado y del dedo cuando una cara queda chica.
//   - Una marca (X, corona, sellador, T): tocar la pieza la pone o la saca.
//   - Prótesis: un toque en una pieza y otro en otra de la misma fila.
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
};

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

/** El margen del dibujo de una pieza: el viewBox arranca 14 unidades de 128
 *  antes del cuadrado, para que la corona y la X no se recorten. */
const MARGEN_DEL_DIBUJO = "calc(var(--lado) * 14 / 128)";

/** La barra de una prótesis del lado de AFUERA de una pieza (arriba de una
 *  superior, abajo de una inferior), como en el papel: en el margen del
 *  dibujo, entre el cuadrado y el número. Va de su centro al borde en los
 *  extremos, de lado a lado en el medio, y hasta la mitad del hueco con la
 *  vecina para que las barras se toquen. */
function BarraDeProtesis({ tramo, lugar, superior }: TramoEnPieza & { superior: boolean }) {
  const borde = `2px ${tramo.tipo === "removible" ? "dashed" : "solid"} ${COLORES_DE_FIGURA[tramo.color]}`;
  const afuera = "calc(var(--hueco) / -2)";
  const vertical = superior ? { top: 0 } : { bottom: 0 };
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-0"
        style={{ ...vertical, borderTop: borde, left: lugar === "inicio" ? "50%" : afuera, right: lugar === "fin" ? "50%" : afuera }}
      />
      {lugar !== "medio" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 w-0"
          style={{ ...vertical, height: MARGEN_DEL_DIBUJO, borderLeft: `2px solid ${COLORES_DE_FIGURA[tramo.color]}` }}
        />
      )}
    </>
  );
}

function describirPieza(pieza: string, contenido: PiezaOdontograma | undefined, leyenda: Leyenda, enProtesis: boolean, inicio: boolean): string {
  const partes: string[] = [];
  for (const cara of CARAS) {
    const color = contenido?.caras?.[cara];
    if (color) partes.push(`cara ${nombreDeCara(cara, pieza)} ${ADJETIVO[color]}`);
  }
  for (const marca of MARCAS_POR_LEYENDA[leyenda]) {
    const color = contenido?.marcas?.[marca];
    if (color) partes.push(`${nombreDeMarca(marca, leyenda)} en ${color}`);
  }
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
  pintaCaras,
  idFoco,
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
  pintaCaras: boolean;
  idFoco?: string;
  registrar: (el: HTMLButtonElement | null) => void;
  onTocar: (cara: Cara | null) => void;
  onTecla: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const idDescripcion = useId();
  const numero = (
    <span aria-hidden="true" className="font-[family-name:var(--font-mono)] text-[11px] leading-none text-grafito/75 tabular-nums">
      {pieza}
    </span>
  );

  function alTocar(e: MouseEvent<HTMLButtonElement>) {
    // Un clic sobre una cara la trae en el dibujo; Enter, Espacio o un
    // toque fuera de las caras llegan sin ella.
    const cara = (e.target as Element).closest?.("[data-cara]")?.getAttribute("data-cara") as Cara | null | undefined;
    onTocar(cara ?? null);
  }

  return (
    <button
      ref={registrar}
      id={idFoco}
      type="button"
      tabIndex={conFoco ? 0 : -1}
      aria-label={`Pieza ${pieza}`}
      aria-describedby={idDescripcion}
      data-pieza={pieza}
      onClick={alTocar}
      onKeyDown={onTecla}
      className={`relative flex w-(--lado) flex-col items-center gap-0.5 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-salvia-oscuro ${
        esInicio ? "ring-2 ring-salvia-oscuro" : ""
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
                data-cara={cara}
                points={POLIGONO[ladoDeCara(cara, pieza)]}
                fill={color ? COLORES_DE_FIGURA[color] : undefined}
                className={color ? undefined : `fill-white ${pintaCaras ? "hover:fill-salvia-claro" : ""}`}
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
          <BarraDeProtesis key={t.indice} {...t} superior={fila.superior} />
        ))}
      </span>
      {!fila.superior && numero}
    </button>
  );
}

// --- La lista de caras de una pieza (teclado y dedo) -----------------------

function SelectorDeCaras({
  pieza,
  contenido,
  color,
  onCara,
  onCerrar,
}: {
  pieza: string;
  contenido: PiezaOdontograma | undefined;
  color: ColorOdontograma;
  onCara: (cara: Cara) => void;
  onCerrar: () => void;
}) {
  const grupo = useRef<HTMLDivElement>(null);
  const primera = useRef<HTMLButtonElement>(null);
  // Se abre debajo del odontograma: en el celular quedaba fuera de la vista.
  useEffect(() => {
    grupo.current?.scrollIntoView({ block: "nearest" });
    primera.current?.focus({ preventScroll: true });
  }, [pieza]);

  return (
    <div
      ref={grupo}
      role="group"
      aria-label={`Caras de la pieza ${pieza}`}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onCerrar();
      }}
      className="flex flex-col gap-2 rounded-card border border-linea bg-marfil p-3"
    >
      <p className="text-sm text-grafito">
        Pieza {pieza}: elegí la cara para pintarla de {color}. Elegirla de nuevo la borra.
      </p>
      <div className="flex flex-wrap gap-2">
        {CARAS.map((cara, i) => {
          const actual = contenido?.caras?.[cara];
          const nombre = nombreDeCara(cara, pieza);
          return (
            <button
              key={cara}
              ref={i === 0 ? primera : undefined}
              type="button"
              aria-label={`Pieza ${pieza}, cara ${nombre}${actual ? `, ${ADJETIVO[actual]}` : ""}`}
              onClick={() => onCara(cara)}
              className={`${PILDORA} flex items-center gap-2 border-linea bg-hueso text-grafito hover:border-salvia`}
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full border border-grafito/40"
                style={{ backgroundColor: actual ? COLORES_DE_FIGURA[actual] : "transparent" }}
              />
              <span className="first-letter:uppercase">{nombre}</span>
            </button>
          );
        })}
        <button type="button" onClick={onCerrar} className={`${PILDORA} border-salvia-oscuro text-salvia-oscuro hover:bg-salvia-claro`}>
          Listo
        </button>
      </div>
    </div>
  );
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
        <path d="M2 4V10H22V4" {...tinta} strokeDasharray={simbolo === "removible" ? "3 2" : undefined} />
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

/** Los extremos de un tramo en el orden del odontograma (como se lee). */
function extremos(filas: FilaDelOdontograma[], t: TramoDeProtesis): [string, string] {
  const fila = filas.find((f) => f.piezas.includes(t.desde));
  if (!fila) return [t.desde, t.hasta];
  return fila.piezas.indexOf(t.desde) <= fila.piezas.indexOf(t.hasta) ? [t.desde, t.hasta] : [t.hasta, t.desde];
}

// --- El campo -------------------------------------------------------------

export function CampoOdontograma({
  campo,
  valor,
  onCambio,
  idFoco,
  etiquetaId,
  describedBy,
}: {
  campo: Pick<CampoDeOdontograma, "denticion" | "leyenda" | "existentes">;
  valor: unknown;
  onCambio: (valor: ValorOdontograma | undefined) => void;
  /** El id que recibe la pieza con el foco: el editor lo busca para llevar
   *  ahí al tocar el odontograma en la hoja. */
  idFoco: string;
  etiquetaId: string;
  describedBy?: string;
}) {
  const { leyenda } = campo;
  const denticion = campo.denticion ?? "ambas";
  const actual = leerOdontograma(valor);
  const filas = filasDe(denticion);
  const herramientas: Herramienta[] = ["caras", ...MARCAS_POR_LEYENDA[leyenda], ...(llevaProtesis(leyenda) ? (["fija", "removible"] as const) : [])];

  const [color, setColor] = useState<ColorOdontograma>("rojo");
  const [herramienta, setHerramienta] = useState<Herramienta>("caras");
  const [foco, setFoco] = useState<string>(filas[0].piezas[0]);
  const [inicio, setInicio] = useState<string | null>(null);
  const [selector, setSelector] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const botones = useRef(new Map<string, HTMLButtonElement>());
  const idExistentes = useId();

  function elegirHerramienta(h: Herramienta) {
    setHerramienta(h);
    setInicio(null);
    setSelector(null);
    setAviso(null);
  }

  function tocarConProtesis(tipo: "fija" | "removible", pieza: string) {
    if (!inicio) {
      setInicio(pieza);
      setAviso(null);
      return;
    }
    const cierre = cerrarTramo(inicio, pieza);
    if (cierre.tipo === "otra-fila") {
      setAviso("Una prótesis une piezas de la misma fila: elegí otra pieza, o tocá de nuevo la primera para cancelar.");
      return;
    }
    setInicio(null);
    if (cierre.tipo === "cancelado") return;
    const nuevo = agregarTramo(actual, { tipo, desde: cierre.desde, hasta: cierre.hasta, color });
    if ((nuevo?.protesis?.length ?? 0) > MAXIMO_DE_TRAMOS) {
      setAviso(`Hay ${MAXIMO_DE_TRAMOS} prótesis marcadas: quitá una para sumar otra.`);
      return;
    }
    setAviso(null);
    onCambio(nuevo);
  }

  function tocar(pieza: string, cara: Cara | null) {
    setFoco(pieza);
    if (herramienta === "fija" || herramienta === "removible") return tocarConProtesis(herramienta, pieza);
    if (herramienta !== "caras") return onCambio(alternarMarca(actual, pieza, herramienta, color));
    if (cara) return onCambio(alternarCara(actual, pieza, cara, color));
    setSelector(pieza);
  }

  function alTeclear(pieza: string, e: KeyboardEvent<HTMLButtonElement>) {
    const destino = moverFoco(filas, pieza, e.key);
    if (!destino) return;
    e.preventDefault();
    setFoco(destino);
    botones.current.get(destino)?.focus();
  }

  function cerrarSelector() {
    const pieza = selector;
    setSelector(null);
    if (pieza) botones.current.get(pieza)?.focus();
  }

  const sugerido = sugerirExistentes(actual);
  const tramos = actual.protesis ?? [];
  const piezasPorFila = Math.max(...filas.map((f) => f.piezas.length));
  const conProtesis = herramienta === "fija" || herramienta === "removible";

  return (
    <div role="group" aria-labelledby={etiquetaId} aria-describedby={describedBy} className="flex min-w-0 flex-col gap-3">
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

      {/* El paso de la prótesis va ARRIBA de las piezas, donde se mira al
          tocarlas, y con su lugar reservado mientras la herramienta está
          elegida: si apareciera recién con el primer toque, correría las
          piezas debajo del dedo antes del segundo. */}
      <p aria-live="polite" className={`text-sm text-grafito empty:hidden ${conProtesis ? "min-h-10" : ""}`}>
        {aviso ??
          (inicio
            ? `${NOMBRE_DE_HERRAMIENTA[herramienta]} desde la ${inicio}: tocá la pieza donde termina, en la misma fila.`
            : conProtesis
              ? "Tocá la pieza donde empieza la prótesis."
              : "")}
      </p>

      {/* Con el dedo, dieciséis piezas de 44 px no entran en un celular: el
          odontograma se desplaza de costado en su propia caja, centrado
          cuando entra (`w-max mx-auto`, CLAUDE.md, TR-180). Con el mouse,
          la pieza se achica sin piso hasta que la fila más larga entre entera
          en la caja (`cqw`): la columna del formulario mide ~380 px, y las
          caras chicas tienen la lista de caras con nombre. Todo en CSS: un `matchMedia` haría que el HTML del
          servidor y el del cliente difieran (TR-172). */}
      <div data-scroll-piezas className="@container -mx-1 overflow-x-auto overscroll-x-contain pb-2">
        <div
          style={{ "--piezas": piezasPorFila } as CSSProperties}
          className="mx-auto flex w-max flex-col gap-6 px-1 py-2 [--hueco:6px] [--lado:2.25rem] pointer-fine:[--hueco:4px] pointer-fine:[--lado:min(2.25rem,calc((100cqw-0.5rem-(var(--piezas)-1)*var(--hueco))/var(--piezas)))] pointer-coarse:[--lado:2.75rem]"
        >
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
                      tramos={tramosEnPieza(filas, tramos, pieza)}
                      leyenda={leyenda}
                      conFoco={pieza === foco}
                      esInicio={pieza === inicio}
                      pintaCaras={herramienta === "caras"}
                      idFoco={pieza === foco ? idFoco : undefined}
                      registrar={(el) => {
                        if (el) botones.current.set(pieza, el);
                        else botones.current.delete(pieza);
                      }}
                      onTocar={(cara) => tocar(pieza, cara)}
                      onTecla={(e) => alTeclear(pieza, e)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {selector && (
        <SelectorDeCaras
          pieza={selector}
          contenido={actual.piezas?.[selector]}
          color={color}
          onCara={(cara) => onCambio(alternarCara(actual, selector, cara, color))}
          onCerrar={cerrarSelector}
        />
      )}

      {tramos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium tracking-wide text-grafito/75 uppercase">Prótesis</p>
          <ul className="flex flex-col gap-1.5">
            {tramos.map((t, i) => {
              const [a, b] = extremos(filas, t);
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
                    onClick={() => onCambio(quitarTramo(actual, i))}
                    className={`rounded-full px-3 py-1 text-sm font-medium text-terracota-oscuro hover:bg-arena ${CLASE_TACTIL}`}
                  >
                    Quitar
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {campo.existentes && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor={idExistentes} className="text-sm text-grafito">
            Cantidad de dientes existentes
          </label>
          <input
            id={idExistentes}
            type="number"
            inputMode="numeric"
            min={0}
            max={filas.reduce((n, f) => n + f.piezas.length, 0)}
            step={1}
            value={actual.existentes ?? ""}
            onChange={(e) => onCambio(conExistentes(actual, e.target.value === "" ? undefined : Number(e.target.value)))}
            className="w-20 rounded-field border border-linea bg-hueso px-3 py-2 text-[15px] text-grafito outline-none focus:border-salvia"
          />
          <span className="text-xs text-grafito/75">Sugerido: {sugerido}</span>
          <button
            type="button"
            onClick={() => onCambio(conExistentes(actual, sugerido))}
            disabled={actual.existentes === sugerido}
            className={`rounded-full border border-linea bg-hueso px-3 py-1 text-sm font-medium text-salvia-oscuro hover:bg-arena disabled:opacity-50 ${CLASE_TACTIL}`}
          >
            Usar
          </button>
        </div>
      )}

      <Referencias leyenda={leyenda} />
    </div>
  );
}
