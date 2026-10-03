// El odontograma (Fase 5.5): el campo donde el profesional marca, pieza por
// pieza, lo que el paciente ya tiene (rojo) y lo que hay que hacer (azul),
// como en el papel del Colegio. Acá vive todo lo que no es dibujar en
// pantalla: qué marcas admite cada leyenda, cómo se valida, cómo se lee en
// el texto que se firma y las FIGURAS, la composición sobre la lámina que se
// congela igual que el texto.
//
// Todo tiene su espejo en internal/documentos (Go) y tiene que dar los
// mismos bytes: el texto y las figuras se congelan, y los fixtures de
// `pnpm documentos:generar` lo verifican. Por eso toda iteración sobre
// claves va en un orden fijo.
import { campoPorId, SIN_DATO, type Campo, type LEYENDAS_DE_ODONTOGRAMA, type OdontogramaDeLamina, type Plantilla, type RecuadroDePieza } from "./esquema";
import { anchoEnUnidades, redondear2 } from "./metricas";
import { PIEZAS_PERMANENTES, piezasDe } from "./piezas";
import { NO_CONSIGNA, type Modo } from "./texto";
import { esObjeto, estaVacio, type Valores } from "./valores";

export type LeyendaDeOdontograma = (typeof LEYENDAS_DE_ODONTOGRAMA)[number];
export type CampoOdontograma = Extract<Campo, { tipo: "odontograma" }>;
export type ColorOdontograma = "rojo" | "azul";
/** Vestibular, lingual o palatina, mesial, distal, oclusal o incisal. */
export type Cara = "V" | "L" | "M" | "D" | "O";
export type MarcaDePieza = "x" | "corona" | "sellador" | "traumatizado";
export type FilaDeOdontograma = "sup-perm" | "inf-perm" | "sup-temp" | "inf-temp";

export interface PiezaOdontograma {
  caras?: Partial<Record<Cara, ColorOdontograma>>;
  marcas?: Partial<Record<MarcaDePieza, ColorOdontograma>>;
}
export interface TramoDeProtesis {
  tipo: "fija" | "removible";
  desde: string;
  hasta: string;
  color: ColorOdontograma;
}
export interface ValorOdontograma {
  piezas?: Record<string, PiezaOdontograma>;
  protesis?: TramoDeProtesis[];
  existentes?: number;
}

export const COLORES_ODONTOGRAMA: readonly ColorOdontograma[] = ["rojo", "azul"];
/** En el orden en que se leen. */
export const CARAS: readonly Cara[] = ["V", "L", "M", "D", "O"];
/** En el orden en que se leen; se dibujan en otro (`ORDEN_DE_DIBUJO`). */
export const MARCAS_DE_PIEZA: readonly MarcaDePieza[] = ["x", "corona", "sellador", "traumatizado"];
export const MARCAS_POR_LEYENDA: Record<LeyendaDeOdontograma, readonly MarcaDePieza[]> = {
  general: ["x", "corona"],
  pediatrica: MARCAS_DE_PIEZA,
};
export const TIPOS_DE_PROTESIS: readonly TramoDeProtesis["tipo"][] = ["fija", "removible"];
export const MAXIMO_DE_TRAMOS = 16;

/** Los rótulos de la leyenda del papel: qué significa cada color. */
export const ETIQUETA_DE_COLOR: Record<LeyendaDeOdontograma, Record<ColorOdontograma, string>> = {
  general: { rojo: "Rojo, prestaciones existentes", azul: "Azul, prestaciones requeridas" },
  pediatrica: { rojo: "Rojo, trabajos realizados", azul: "Azul, trabajos a realizar" },
};

export function llevaProtesis(leyenda: LeyendaDeOdontograma): boolean {
  return leyenda === "general";
}

const FILA_POR_CUADRANTE: Record<string, FilaDeOdontograma> = {
  "1": "sup-perm",
  "2": "sup-perm",
  "3": "inf-perm",
  "4": "inf-perm",
  "5": "sup-temp",
  "6": "sup-temp",
  "7": "inf-temp",
  "8": "inf-temp",
};

/** La fila del papel de una pieza válida: una prótesis no la cruza. */
export function filaDe(pieza: string): FilaDeOdontograma {
  return FILA_POR_CUADRANTE[pieza[0]];
}

const esSuperior = (pieza: string) => "1256".includes(pieza[0]);
/** La derecha del paciente, que en el papel se dibuja a la izquierda. */
const esDeLaDerecha = (pieza: string) => "1458".includes(pieza[0]);
const esPosterior = (pieza: string) => Number(pieza[1]) >= 4;

export function nombreDeCara(cara: Cara, pieza: string): string {
  switch (cara) {
    case "V":
      return "vestibular";
    case "L":
      return esSuperior(pieza) ? "palatina" : "lingual";
    case "M":
      return "mesial";
    case "D":
      return "distal";
    case "O":
      return esPosterior(pieza) ? "oclusal" : "incisal";
  }
}

const NOMBRE_DE_MARCA: Record<MarcaDePieza, string> = {
  x: "ausente o a extraer",
  corona: "corona",
  sellador: "sellador",
  traumatizado: "traumatizada",
};

export function nombreDeMarca(marca: MarcaDePieza, leyenda: LeyendaDeOdontograma): string {
  if (marca === "x" && leyenda === "pediatrica") return "a extraer, extraída o ausente";
  return NOMBRE_DE_MARCA[marca];
}

/** Lo que se ofrece en "Cantidad de dientes existentes": las 32
 *  permanentes menos las marcadas con una x, del color que sea. */
export function sugerirExistentes(valor: ValorOdontograma): number {
  return PIEZAS_PERMANENTES.filter((p) => !valor.piezas?.[p]?.marcas?.x).length;
}

// --- Vacío y validación (§2 y §3 del contrato) ---------------------------

const FORMA = "El odontograma no tiene la forma esperada.";
const COLOR = "Hay un color que no es rojo ni azul.";
const CLAVES_DEL_VALOR = ["existentes", "piezas", "protesis"];

const ausenteOSinClaves = (v: unknown) => v === undefined || (esObjeto(v) && Object.keys(v).length === 0);
const piezaVacia = (pieza: unknown) =>
  esObjeto(pieza) && Object.keys(pieza).every((k) => k === "caras" || k === "marcas") && ausenteOSinClaves(pieza.caras) && ausenteOSinClaves(pieza.marcas);

/** Vacío es SOLO un valor bien formado sin nada cargado: un objeto con
 *  claves de entre piezas, protesis y existentes; piezas ausente o con
 *  piezas de la dentición cuyas caras y marcas estén ausentes o sin
 *  claves; protesis ausente o vacía; existentes ausente. Cualquier otra
 *  cosa no está vacía y la rechaza la validación: si no, un valor roto se
 *  guardaría sin validar. Tiene que ser idéntica a la de Go (EstaVacio). */
export function odontogramaVacio(campo: CampoOdontograma, valor: unknown): boolean {
  if (!esObjeto(valor) || Object.keys(valor).some((k) => !CLAVES_DEL_VALOR.includes(k))) return false;
  const { piezas, protesis, existentes } = valor;
  if (existentes !== undefined) return false;
  if (protesis !== undefined && !(Array.isArray(protesis) && protesis.length === 0)) return false;
  if (piezas === undefined) return true;
  const validas = piezasDe(campo.denticion ?? "ambas");
  return esObjeto(piezas) && Object.entries(piezas).every(([pieza, contenido]) => validas.includes(pieza) && piezaVacia(contenido));
}
const CLAVES_DEL_TRAMO = "color,desde,hasta,tipo";

const incluye = (lista: readonly string[], v: unknown) => typeof v === "string" && lista.includes(v);
const esColor = (v: unknown): v is ColorOdontograma => incluye(COLORES_ODONTOGRAMA, v);
const piezaAjena = (pieza: unknown) => `${String(pieza)} no es una pieza de este odontograma.`;

function errorDePieza(pieza: unknown, leyenda: LeyendaDeOdontograma): string | null {
  if (!esObjeto(pieza) || Object.keys(pieza).some((k) => k !== "caras" && k !== "marcas")) return FORMA;
  const { caras = {}, marcas = {} } = pieza;
  if (!esObjeto(caras) || !esObjeto(marcas)) return FORMA;
  if (Object.keys(caras).some((c) => !incluye(CARAS, c))) return "Hay una cara que no existe.";
  const marcaAjena = Object.keys(marcas)
    .sort()
    .find((m) => !incluye(MARCAS_POR_LEYENDA[leyenda], m));
  if (marcaAjena !== undefined) return `La marca ${marcaAjena} no va en este odontograma.`;
  return [...Object.values(caras), ...Object.values(marcas)].every(esColor) ? null : COLOR;
}

// --- Los conflictos lógicos: lo que el papel no admite ------------------
// Una pieza ausente (X roja) no lleva nada más; una que se va a extraer
// (X azul) no lleva nada por hacer (azul). Y una prótesis no se apoya en
// una pieza ausente, ni una por hacer en una que se va a extraer: las
// piezas INTERMEDIAS sí pueden faltar, es lo que la prótesis reemplaza.
// El editor los usa también, para no dejar hacerlos.

/** El conflicto de una pieza ya validada, o null. */
export function conflictoDePieza(pieza: string, contenido: PiezaOdontograma | undefined): string | null {
  const x = contenido?.marcas?.x;
  if (!x) return null;
  const otras = [...Object.values(contenido?.caras ?? {}), ...MARCAS_DE_PIEZA.filter((m) => m !== "x").map((m) => contenido?.marcas?.[m])].filter(
    (c) => c !== undefined,
  );
  if (x === "rojo" && otras.length > 0) return `La pieza ${pieza} está ausente: no lleva prestaciones.`;
  if (x === "azul" && otras.includes("azul")) return `La pieza ${pieza} se va a extraer: no lleva prestaciones requeridas.`;
  return null;
}

/** Si una pieza puede ser pilar de una prótesis de ese color, o por qué no. */
export function conflictoDePilar(pieza: string, contenido: PiezaOdontograma | undefined, color: ColorOdontograma): string | null {
  const x = contenido?.marcas?.x;
  if (x === "rojo") return `La pieza ${pieza} está ausente: no puede ser pilar.`;
  if (x === "azul" && color === "azul") return `La pieza ${pieza} se va a extraer: no puede ser pilar.`;
  return null;
}

function errorDePiezas(piezas: Record<string, unknown>, validas: readonly string[], leyenda: LeyendaDeOdontograma): string | null {
  for (const pieza of Object.keys(piezas).sort()) {
    const error = validas.includes(pieza)
      ? (errorDePieza(piezas[pieza], leyenda) ?? conflictoDePieza(pieza, piezas[pieza] as PiezaOdontograma))
      : piezaAjena(pieza);
    if (error) return error;
  }
  return null;
}

function errorDeTramo(tramo: unknown, validas: readonly string[]): string | null {
  if (!esObjeto(tramo) || Object.keys(tramo).sort().join() !== CLAVES_DEL_TRAMO) return FORMA;
  if (!incluye(TIPOS_DE_PROTESIS, tramo.tipo)) return "Hay una prótesis de un tipo que no existe.";
  const ajenas = [tramo.desde, tramo.hasta].filter((p) => !incluye(validas, p));
  if (ajenas.length > 0) return piezaAjena(ajenas[0]);
  const [desde, hasta] = [tramo.desde as string, tramo.hasta as string];
  if (desde === hasta) return "Una prótesis une al menos dos piezas.";
  if (filaDe(desde) !== filaDe(hasta)) return "Una prótesis une piezas de la misma arcada.";
  return esColor(tramo.color) ? null : COLOR;
}

export const PROTESIS_SUPERPUESTA = "Esa prótesis se superpone con otra.";

function rangoEn(orden: readonly string[], { desde, hasta }: TramoDeProtesis): [number, number] {
  const [i, j] = [orden.indexOf(desde), orden.indexOf(hasta)];
  return i <= j ? [i, j] : [j, i];
}

/** Si dos prótesis comparten alguna pieza (pilares incluidos): en el papel
 *  van por el mismo centro de la fila y se encimarían. Cada fila es un tramo
 *  contiguo de `orden`, así que alcanza con que sus rangos se toquen. */
export function seSuperponen(a: TramoDeProtesis, b: TramoDeProtesis, orden: readonly string[]): boolean {
  if (filaDe(a.desde) !== filaDe(b.desde)) return false;
  const [[a1, a2], [b1, b2]] = [rangoEn(orden, a), rangoEn(orden, b)];
  return a1 <= b2 && b1 <= a2;
}

function errorDeProtesis(
  protesis: unknown[],
  validas: readonly string[],
  leyenda: LeyendaDeOdontograma,
  piezas: Record<string, PiezaOdontograma | undefined>,
): string | null {
  if (protesis.length === 0) return null;
  if (!llevaProtesis(leyenda)) return "Este odontograma no lleva prótesis.";
  if (protesis.length > MAXIMO_DE_TRAMOS) return "Hay demasiadas prótesis.";
  for (const tramo of protesis) {
    const error = errorDeTramo(tramo, validas);
    if (error) return error;
  }
  const tramos = protesis as TramoDeProtesis[];
  if (tramos.some((t, i) => tramos.slice(0, i).some((anterior) => seSuperponen(t, anterior, validas)))) return PROTESIS_SUPERPUESTA;
  for (const { desde, hasta, color } of tramos) {
    const error = conflictoDePilar(desde, piezas[desde], color) ?? conflictoDePilar(hasta, piezas[hasta], color);
    if (error) return error;
  }
  return null;
}

function errorDeExistentes(campo: CampoOdontograma, existentes: unknown, total: number): string | null {
  if (existentes === undefined) return null;
  if (!campo.existentes) return "Este odontograma no lleva la cantidad de dientes existentes.";
  const valida = typeof existentes === "number" && Number.isInteger(existentes) && existentes >= 0 && existentes <= total;
  return valida ? null : `La cantidad de dientes existentes tiene que ser un número entero entre 0 y ${total}.`;
}

/** El primer error del valor, en el orden del contrato: la forma, las
 *  piezas (por clave, en orden lexicográfico; cada una, después de su
 *  forma, sus conflictos), las prótesis (en el orden del array: cada una,
 *  después la superposición y después los pilares) y los dientes
 *  existentes. */
export function errorDeOdontograma(campo: CampoOdontograma, valor: unknown): string | null {
  if (!esObjeto(valor) || Object.keys(valor).some((k) => !CLAVES_DEL_VALOR.includes(k))) return FORMA;
  const { piezas = {}, protesis = [], existentes } = valor;
  if (!esObjeto(piezas) || !Array.isArray(protesis)) return FORMA;
  const validas = piezasDe(campo.denticion ?? "ambas");
  return (
    errorDePiezas(piezas, validas, campo.leyenda) ??
    errorDeProtesis(protesis, validas, campo.leyenda, piezas as Record<string, PiezaOdontograma | undefined>) ??
    errorDeExistentes(campo, existentes, validas.length)
  );
}

// --- El texto que se congela (§4) ----------------------------------------

/** "a", "a y b", "a, b y c". */
function enumerar(items: string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function partesDePieza(pieza: string, contenido: PiezaOdontograma | undefined, color: ColorOdontograma, leyenda: LeyendaDeOdontograma): string[] {
  const caras = CARAS.filter((c) => contenido?.caras?.[c] === color).map((c) => nombreDeCara(c, pieza));
  const marcas = MARCAS_DE_PIEZA.filter((m) => contenido?.marcas?.[m] === color).map((m) => nombreDeMarca(m, leyenda));
  if (caras.length === 0) return marcas;
  return [caras.length === 1 ? `cara ${caras[0]}` : `caras ${enumerar(caras)}`, ...marcas];
}

function grupoDeColor(v: ValorOdontograma, color: ColorOdontograma, leyenda: LeyendaDeOdontograma, orden: readonly string[]): string {
  const piezas = orden.flatMap((p) => {
    const partes = partesDePieza(p, v.piezas?.[p], color, leyenda);
    return partes.length > 0 ? [`${p} (${partes.join("; ")})`] : [];
  });
  return piezas.length > 0 ? `${ETIQUETA_DE_COLOR[leyenda][color]}: ${piezas.join(", ")}` : "";
}

interface TramoOrdenado {
  tramo: TramoDeProtesis;
  /** Las dos puntas, en el orden del odontograma. */
  primera: string;
  segunda: string;
}

/** Los tramos por tipo (fija primero), color (rojo primero) y posición de
 *  sus puntas en el odontograma: el mismo documento se lee igual sin
 *  importar en qué orden se cargó. */
function tramosEnOrden(protesis: unknown, orden: readonly string[]): TramoOrdenado[] {
  const tramos = Array.isArray(protesis) ? (protesis as TramoDeProtesis[]) : [];
  return tramos
    .map((tramo) =>
      orden.indexOf(tramo.desde) <= orden.indexOf(tramo.hasta)
        ? { tramo, primera: tramo.desde, segunda: tramo.hasta }
        : { tramo, primera: tramo.hasta, segunda: tramo.desde },
    )
    .sort(
      (a, b) =>
        TIPOS_DE_PROTESIS.indexOf(a.tramo.tipo) - TIPOS_DE_PROTESIS.indexOf(b.tramo.tipo) ||
        COLORES_ODONTOGRAMA.indexOf(a.tramo.color) - COLORES_ODONTOGRAMA.indexOf(b.tramo.color) ||
        orden.indexOf(a.primera) - orden.indexOf(b.primera) ||
        orden.indexOf(a.segunda) - orden.indexOf(b.segunda),
    );
}

/** Cómo se lee el odontograma en el documento: el grupo rojo, el azul, las
 *  prótesis y los dientes existentes. Un valor vacío no llega acá. */
export function textoDeOdontograma(campo: CampoOdontograma, v: ValorOdontograma): string {
  const orden = piezasDe(campo.denticion ?? "ambas");
  const protesis = tramosEnOrden(v.protesis, orden).map(
    ({ tramo, primera, segunda }) => `${tramo.tipo} en ${tramo.color}, de ${primera} a ${segunda}`,
  );
  const grupos = [
    ...COLORES_ODONTOGRAMA.map((color) => grupoDeColor(v, color, campo.leyenda, orden)),
    protesis.length > 0 ? `Prótesis: ${protesis.join("; ")}` : "",
    v.existentes === undefined ? "" : `Dientes existentes: ${v.existentes}`,
  ].filter((g) => g !== "");
  return grupos.length > 0 ? `${grupos.join(". ")}.` : "";
}

// --- Las figuras (§6) ----------------------------------------------------

export type ColorDeFigura = ColorOdontograma | "tinta";
export type Punto = [number, number];
export type Figura =
  | { tipo: "poligono"; pagina: number; puntos: Punto[]; relleno: ColorDeFigura }
  | { tipo: "contorno"; pagina: number; puntos: Punto[]; color: ColorDeFigura; grosor: number }
  | { tipo: "linea"; pagina: number; desde: Punto; hasta: Punto; color: ColorDeFigura; grosor: number; discontinua?: true }
  | { tipo: "circulo"; pagina: number; centro: Punto; radio: number; color: ColorDeFigura; grosor: number }
  | { tipo: "texto"; pagina: number; x: number; y: number; tamano: number; texto: string; color: ColorDeFigura };

/** Los colores con que se dibujan (la tinta es la de la lámina). */
export const COLORES_DE_FIGURA: Record<ColorDeFigura, string> = { rojo: "#d0202e", azul: "#1f4fbf", tinta: "#16181d" };

const GROSOR_LINEA = 1.4;
const GROSOR_CONTORNO = 1.1;
/** Cuánto se achica cada cara hacia su centro: las líneas impresas del
 *  papel siguen a la vista entre una cara pintada y la de al lado. */
const ACHIQUE = 0.82;
/** Las marcas se dibujan de la más grande a la más chica. */
const ORDEN_DE_DIBUJO: readonly MarcaDePieza[] = ["corona", "x", "sellador", "traumatizado"];

/** El lado del recuadro de una pieza donde va cada cara. Lo usan las figuras
 *  y el editor de la web: una sola regla para los dos. */
export type LadoDeRecuadro = "arriba" | "abajo" | "izquierda" | "derecha" | "centro";
type Lado = LadoDeRecuadro;

export function ladoDeCara(cara: Cara, pieza: string): Lado {
  switch (cara) {
    case "O":
      return "centro";
    case "V":
      return esSuperior(pieza) ? "arriba" : "abajo";
    case "L":
      return esSuperior(pieza) ? "abajo" : "arriba";
    case "M":
      return esDeLaDerecha(pieza) ? "derecha" : "izquierda";
    case "D":
      return esDeLaDerecha(pieza) ? "izquierda" : "derecha";
  }
}

const redondearPunto = ([x, y]: Punto): Punto => [redondear2(x), redondear2(y)];

function achicar(puntos: Punto[]): Punto[] {
  const cx = puntos.reduce((suma, p) => suma + p[0], 0) / puntos.length;
  const cy = puntos.reduce((suma, p) => suma + p[1], 0) / puntos.length;
  return puntos.map(([x, y]) => redondearPunto([cx + ACHIQUE * (x - cx), cy + ACHIQUE * (y - cy)]));
}

/** El recuadro de una pieza son cuatro trapecios alrededor de un cuadrado
 *  central de 0,42 del lado. */
function poligonoDeLado({ x, y, lado: L }: RecuadroDePieza, lado: Lado): Punto[] {
  const li = 0.42 * L;
  const xi = x + (L - li) / 2;
  const yi = y + (L - li) / 2;
  const vertices: Record<Lado, Punto[]> = {
    arriba: [[x, y], [x + L, y], [xi + li, yi], [xi, yi]],
    abajo: [[x, y + L], [xi, yi + li], [xi + li, yi + li], [x + L, y + L]],
    izquierda: [[x, y], [xi, yi], [xi, yi + li], [x, y + L]],
    derecha: [[x + L, y], [x + L, y + L], [xi + li, yi + li], [xi + li, yi]],
    centro: [[xi, yi], [xi + li, yi], [xi + li, yi + li], [xi, yi + li]],
  };
  return achicar(vertices[lado]);
}

function linea(pagina: number, desde: Punto, hasta: Punto, color: ColorDeFigura, discontinua: boolean): Figura {
  const figura = { tipo: "linea" as const, pagina, desde: redondearPunto(desde), hasta: redondearPunto(hasta), color, grosor: GROSOR_LINEA };
  return discontinua ? { ...figura, discontinua: true } : figura;
}

/** Un texto centrado en un ancho, con su línea de base en `y`. */
function textoCentrado(pagina: number, texto: string, tamano: number, x: number, ancho: number, y: number, color: ColorDeFigura): Figura {
  const anchoTexto = (anchoEnUnidades(texto) * tamano) / 1000;
  return { tipo: "texto", pagina, x: redondear2(x + (ancho - anchoTexto) / 2), y: redondear2(y), tamano, texto, color };
}

function figurasDeMarca(marca: MarcaDePieza, color: ColorOdontograma, r: RecuadroDePieza, pagina: number): Figura[] {
  const { x, y, lado: L } = r;
  switch (marca) {
    case "corona":
      return [{ tipo: "circulo", pagina, centro: redondearPunto([x + L / 2, y + L / 2]), radio: redondear2(0.62 * L), color, grosor: GROSOR_CONTORNO }];
    case "x": {
      const m = 0.08 * L;
      return [linea(pagina, [x + m, y + m], [x + L - m, y + L - m], color, false), linea(pagina, [x + L - m, y + m], [x + m, y + L - m], color, false)];
    }
    case "sellador": {
      const puntos: Punto[] = [[x + L / 2, y + 0.15 * L], [x + 0.85 * L, y + 0.82 * L], [x + 0.15 * L, y + 0.82 * L]];
      return [{ tipo: "contorno", pagina, puntos: puntos.map(redondearPunto), color, grosor: GROSOR_CONTORNO }];
    }
    case "traumatizado":
      return [textoCentrado(pagina, "T", redondear2(0.8 * L), x, L, y + 0.78 * L, color)];
  }
}

function figurasDePieza(pieza: string, contenido: PiezaOdontograma, r: RecuadroDePieza, pagina: number): Figura[] {
  const caras = CARAS.flatMap((cara): Figura[] => {
    const relleno = contenido.caras?.[cara];
    return esColor(relleno) ? [{ tipo: "poligono", pagina, puntos: poligonoDeLado(r, ladoDeCara(cara, pieza)), relleno }] : [];
  });
  const marcas = ORDEN_DE_DIBUJO.flatMap((marca) => {
    const color = contenido.marcas?.[marca];
    return esColor(color) ? figurasDeMarca(marca, color, r, pagina) : [];
  });
  return [...caras, ...marcas];
}

/** Una prótesis es una línea por el centro de su fila, de pilar a pilar (la
 *  removible, discontinua): como se dibuja a mano en el papel. Dos prótesis
 *  no comparten piezas (lo rechaza la validación), así que no se enciman. */
function figurasDeTramo({ tramo, primera, segunda }: TramoOrdenado, recuadros: Map<string, RecuadroDePieza>, pagina: number): Figura[] {
  const [r1, r2] = [recuadros.get(primera), recuadros.get(segunda)];
  if (!r1 || !r2) return [];
  const [a, b] = r1.x <= r2.x ? [r1, r2] : [r2, r1];
  const yc = redondear2((a.y + a.lado / 2 + (b.y + b.lado / 2)) / 2);
  return [linea(pagina, [a.x + a.lado / 2, yc], [b.x + b.lado / 2, yc], tramo.color, tramo.tipo === "removible")];
}

function figurasDeExistentes(o: OdontogramaDeLamina, existentes: unknown, modo: Modo): Figura[] {
  if (!o.existentes) return [];
  const texto = typeof existentes === "number" ? String(existentes) : modo === "sellado" ? SIN_DATO : null;
  if (texto === null) return [];
  const { x, y, ancho, tamano = 10 } = o.existentes;
  return [textoCentrado(o.pagina, texto, tamano, x, ancho, y, "tinta")];
}

/** "No consigna" en el medio de la caja que envuelve todos los recuadros:
 *  un odontograma terminado no queda en blanco (Decreto 1089/2012, art. 15). */
function noConsigna(o: OdontogramaDeLamina): Figura {
  const minX = Math.min(...o.piezas.map((r) => r.x));
  const minY = Math.min(...o.piezas.map((r) => r.y));
  const ancho = Math.max(...o.piezas.map((r) => r.x + r.lado)) - minX;
  const alto = Math.max(...o.piezas.map((r) => r.y + r.lado)) - minY;
  return textoCentrado(o.pagina, NO_CONSIGNA, 10, minX, ancho, minY + alto / 2 + 3.5, "tinta");
}

function figurasDeOdontograma(o: OdontogramaDeLamina, plantilla: Plantilla, valor: unknown, modo: Modo): Figura[] {
  const campo = campoPorId(plantilla, o.campo);
  if (campo?.tipo !== "odontograma") return [];
  const v = (esObjeto(valor) ? valor : {}) as ValorOdontograma;
  const orden = piezasDe(campo.denticion ?? "ambas");
  const recuadros = new Map(o.piezas.map((r) => [r.pieza, r]));
  const figuras = [
    ...orden.flatMap((pieza) => {
      const [contenido, r] = [v.piezas?.[pieza], recuadros.get(pieza)];
      return esObjeto(contenido) && r ? figurasDePieza(pieza, contenido, r, o.pagina) : [];
    }),
    ...tramosEnOrden(v.protesis, orden).flatMap((t) => figurasDeTramo(t, recuadros, o.pagina)),
    ...figurasDeExistentes(o, v.existentes, modo),
  ];
  if (modo === "sellado" && estaVacio(campo, valor)) figuras.push(noConsigna(o));
  return figuras;
}

/** La composición de los odontogramas de la lámina: las piezas en el orden
 *  del odontograma (caras V, L, M, D, O y después las marcas), las
 *  prótesis en el orden del texto, la cantidad de dientes existentes y, si
 *  está vacío y terminado, "No consigna". Al terminar el documento la API
 *  la congela con `ArmarFiguras` (Go), que tiene que dar lo mismo. */
export function armarFiguras(plantilla: Plantilla, valores: Valores, modo: Modo): Figura[] {
  return (plantilla.lamina?.odontogramas ?? []).flatMap((o) => figurasDeOdontograma(o, plantilla, valores[o.campo], modo));
}
