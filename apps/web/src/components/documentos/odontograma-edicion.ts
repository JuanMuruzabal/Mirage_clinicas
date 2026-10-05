// La lógica pura del control del odontograma (Fase 5.5): qué valor queda
// después de cada toque, y cómo se recorren las piezas con el teclado. El
// componente (`campo-odontograma.tsx`) solo dibuja y llama a esto.
//
// Cada función devuelve el valor LIMPIO: sin piezas vacías ni listas
// vacías, y `undefined` cuando no queda nada (el editor borra el campo, el
// mismo criterio que un texto que se vacía).
import {
  conflictoDePieza,
  conflictoDePilar,
  esObjeto,
  filaDe,
  piezasDe,
  PROTESIS_SUPERPUESTA,
  seSuperponen,
  type Cara,
  type ColorOdontograma,
  type Denticion,
  type FilaDeOdontograma,
  type MarcaDePieza,
  type PiezaOdontograma,
  type TramoDeProtesis,
  type ValorOdontograma,
} from "@dental-mirage/documentos-clinicos";

export type TipoDeProtesis = TramoDeProtesis["tipo"];
export type Herramienta = "caras" | MarcaDePieza | TipoDeProtesis | "borrador";

/** Lo guardado, como valor del odontograma: cualquier otra cosa (un valor
 *  roto de un borrador viejo) arranca vacío en vez de romper el control. */
export function leerOdontograma(valor: unknown): ValorOdontograma {
  return esObjeto(valor) ? (valor as ValorOdontograma) : {};
}

function piezaLimpia(p: PiezaOdontograma | undefined): PiezaOdontograma | undefined {
  const caras = p?.caras && Object.keys(p.caras).length > 0 ? p.caras : undefined;
  const marcas = p?.marcas && Object.keys(p.marcas).length > 0 ? p.marcas : undefined;
  if (!caras && !marcas) return undefined;
  return { ...(caras ? { caras } : {}), ...(marcas ? { marcas } : {}) };
}

export function limpiar(v: ValorOdontograma): ValorOdontograma | undefined {
  const piezas: Record<string, PiezaOdontograma> = {};
  for (const [pieza, contenido] of Object.entries(v.piezas ?? {})) {
    const limpia = piezaLimpia(contenido);
    if (limpia) piezas[pieza] = limpia;
  }
  const resultado: ValorOdontograma = {
    ...(Object.keys(piezas).length > 0 ? { piezas } : {}),
    ...(v.protesis && v.protesis.length > 0 ? { protesis: v.protesis } : {}),
    ...(v.existentes !== undefined ? { existentes: v.existentes } : {}),
  };
  return Object.keys(resultado).length > 0 ? resultado : undefined;
}

/** Alterna un color en un mapa (de caras o de marcas): el mismo color lo
 *  saca; otro, lo cambia. */
function alternar<K extends string>(mapa: Partial<Record<K, ColorOdontograma>> | undefined, clave: K, color: ColorOdontograma) {
  const nuevo: Partial<Record<K, ColorOdontograma>> = { ...mapa };
  if (nuevo[clave] === color) delete nuevo[clave];
  else nuevo[clave] = color;
  return nuevo;
}

function conPieza(v: ValorOdontograma, pieza: string, cambio: (p: PiezaOdontograma) => PiezaOdontograma) {
  return limpiar({ ...v, piezas: { ...v.piezas, [pieza]: cambio(v.piezas?.[pieza] ?? {}) } });
}

export function alternarCara(v: ValorOdontograma, pieza: string, cara: Cara, color: ColorOdontograma) {
  return conPieza(v, pieza, (p) => ({ ...p, caras: alternar(p.caras, cara, color) }));
}

export function alternarMarca(v: ValorOdontograma, pieza: string, marca: MarcaDePieza, color: ColorOdontograma) {
  return conPieza(v, pieza, (p) => ({ ...p, marcas: alternar(p.marcas, marca, color) }));
}

/** Si `nuevo` reemplaza a `t`: mismo tipo entre las mismas dos piezas. */
const loReemplaza = (t: TramoDeProtesis, nuevo: TramoDeProtesis) =>
  t.tipo === nuevo.tipo && ((t.desde === nuevo.desde && t.hasta === nuevo.hasta) || (t.desde === nuevo.hasta && t.hasta === nuevo.desde));

/** Suma un tramo; uno del mismo tipo entre las mismas dos piezas se
 *  reemplaza (cambiarle el color no lo duplica). */
export function agregarTramo(v: ValorOdontograma, tramo: TramoDeProtesis) {
  const otros = (v.protesis ?? []).filter((t) => !loReemplaza(t, tramo));
  return limpiar({ ...v, protesis: [...otros, tramo] });
}

/** El orden de las piezas en el que se miden los rangos: dentro de una
 *  fila es el mismo para cualquier dentición. */
const ORDEN = piezasDe("ambas");

/** Si un tramo nuevo compartiría piezas con otro ya marcado (la validación
 *  lo rechaza: en el papel se encimarían). El que reemplaza no cuenta. */
export function seSuperponeConOtro(v: ValorOdontograma, tramo: TramoDeProtesis): boolean {
  return (v.protesis ?? []).some((t) => !loReemplaza(t, tramo) && seSuperponen(t, tramo, ORDEN));
}

/** El borrador sobre una pieza: sus caras, sus marcas y las prótesis que
 *  pasan por ella, como pilar o como pieza intermedia. */
export function borrarPieza(v: ValorOdontograma, pieza: string) {
  const sola: TramoDeProtesis = { tipo: "fija", desde: pieza, hasta: pieza, color: "rojo" };
  const piezas = { ...v.piezas };
  delete piezas[pieza];
  return limpiar({ ...v, piezas, protesis: (v.protesis ?? []).filter((t) => !seSuperponen(t, sola, ORDEN)) });
}

// --- Los conflictos lógicos, antes de que pasen ----------------------------

/** El primer conflicto que el valor deja en una pieza, como pieza y como
 *  pilar de sus prótesis: el mismo texto que la validación del paquete. */
export function conflictoEnPieza(v: ValorOdontograma | undefined, pieza: string): string | null {
  const contenido = v?.piezas?.[pieza];
  const comoPilar = (v?.protesis ?? []).filter((t) => t.desde === pieza || t.hasta === pieza).map((t) => conflictoDePilar(pieza, contenido, t.color));
  return conflictoDePieza(pieza, contenido) ?? comoPilar.find((c) => c !== null) ?? null;
}

/** Lo que pasa con una acción sobre una pieza: el valor nuevo, o por qué
 *  no se aplica (y, para la X, cómo aplicarla borrando lo que choca). */
export type ResultadoDeAccion =
  | { tipo: "aplicada"; valor: ValorOdontograma | undefined }
  | { tipo: "conflicto"; mensaje: string; resolver?: { etiqueta: string; valor: ValorOdontograma | undefined } };

function comprobar(nuevo: ValorOdontograma | undefined, pieza: string): ResultadoDeAccion {
  const mensaje = conflictoEnPieza(nuevo, pieza);
  return mensaje ? { tipo: "conflicto", mensaje } : { tipo: "aplicada", valor: nuevo };
}

export function pintarCara(v: ValorOdontograma, pieza: string, cara: Cara, color: ColorOdontograma): ResultadoDeAccion {
  return comprobar(alternarCara(v, pieza, cara, color), pieza);
}

/** Pone o saca una marca. Una X que chocaría con lo que la pieza ya tiene
 *  no se aplica: ofrece borrar eso primero. */
export function marcar(v: ValorOdontograma, pieza: string, marca: MarcaDePieza, color: ColorOdontograma): ResultadoDeAccion {
  const resultado = comprobar(alternarMarca(v, pieza, marca, color), pieza);
  if (resultado.tipo === "aplicada" || marca !== "x") return resultado;
  const ausente = color === "rojo";
  return {
    tipo: "conflicto",
    mensaje: ausente
      ? `La pieza ${pieza} tiene prestaciones marcadas: borralas antes de marcarla ausente.`
      : `La pieza ${pieza} tiene prestaciones requeridas marcadas: borralas antes de marcarla para extraer.`,
    resolver: { etiqueta: ausente ? "Borrar y marcar ausente" : "Borrar y marcar para extraer", valor: marcarXBorrando(v, pieza, color) },
  };
}

/** La X después de borrar lo que choca con ella: todo, si es roja
 *  (ausente); lo azul, si es azul (a extraer). Y las prótesis que se
 *  apoyan en la pieza y ya no podrían. */
function marcarXBorrando(v: ValorOdontograma, pieza: string, color: ColorOdontograma) {
  const queda = <K extends string>(mapa: Partial<Record<K, ColorOdontograma>> | undefined) =>
    Object.fromEntries(Object.entries(mapa ?? {}).filter(([, c]) => color === "azul" && c === "rojo")) as Partial<Record<K, ColorOdontograma>>;
  const actual = v.piezas?.[pieza];
  const nueva: PiezaOdontograma = { caras: queda(actual?.caras), marcas: { ...queda(actual?.marcas), x: color } };
  const protesis = (v.protesis ?? []).filter((t) => !((t.desde === pieza || t.hasta === pieza) && conflictoDePilar(pieza, nueva, t.color)));
  return limpiar({ ...v, piezas: { ...v.piezas, [pieza]: nueva }, protesis });
}

/** "Borrar todo": las marcas y las prótesis. La cantidad de dientes
 *  existentes es un dato aparte, que se carga a mano, y queda. */
export function borrarTodo(v: ValorOdontograma) {
  return conExistentes({}, v.existentes);
}

export function quitarTramo(v: ValorOdontograma, indice: number) {
  return limpiar({ ...v, protesis: (v.protesis ?? []).filter((_, i) => i !== indice) });
}

export function conExistentes(v: ValorOdontograma, existentes: number | undefined) {
  const nuevo = { ...v, existentes };
  if (existentes === undefined) delete nuevo.existentes;
  return limpiar(nuevo);
}

/** Los extremos de un tramo como se leen en el papel, de izquierda a
 *  derecha: dentro de una fila, `ORDEN` es el orden del dibujo. */
export function extremosDe(t: TramoDeProtesis): [string, string] {
  return ORDEN.indexOf(t.desde) <= ORDEN.indexOf(t.hasta) ? [t.desde, t.hasta] : [t.hasta, t.desde];
}

// --- Una pieza escrita a mano ----------------------------------------------

/** Lo que dice un campo de pieza: nada mientras se escribe (menos de dos
 *  dígitos), la pieza si es de la dentición, o por qué no lo es (el mismo
 *  texto que la validación del paquete, que no lo exporta). */
export interface PiezaEscrita {
  pieza: string | null;
  error: string | null;
}

export function leerPiezaEscrita(texto: string, denticion: Denticion): PiezaEscrita {
  if (texto.length < 2) return { pieza: null, error: null };
  if (!piezasDe(denticion).includes(texto)) return { pieza: null, error: `${texto} no es una pieza de este odontograma.` };
  return { pieza: texto, error: null };
}

/** Solo dígitos, y a lo sumo dos: un número FDI. */
export const soloDosDigitos = (texto: string) => texto.replace(/\D/g, "").slice(0, 2);

// --- La prótesis, en pasos --------------------------------------------------
// Elegir el inicio, elegir el fin y confirmar. Ningún toque arma nada por
// sí solo: la prótesis se guarda recién con "Guardar" (antes, el segundo
// toque la armaba aunque no se hubiera apretado "Empezar").

export type PasoDeProtesis = "inicio" | "fin" | "confirmar";

/** La operación en curso: el paso y lo que dicen los campos Desde y Hasta
 *  (lo tocado en el diagrama también se escribe ahí). */
export interface OperacionDeProtesis {
  paso: PasoDeProtesis;
  desde: string;
  hasta: string;
}

export const OPERACION_VACIA: OperacionDeProtesis = { paso: "inicio", desde: "", hasta: "" };

export interface ContextoDeProtesis {
  valor: ValorOdontograma;
  denticion: Denticion;
  tipo: TipoDeProtesis;
  color: ColorOdontograma;
}

export type AccionDeProtesis =
  | { tipo: "tocar"; pieza: string }
  | { tipo: "escribir"; campo: "desde" | "hasta"; texto: string }
  | { tipo: "empezar" }
  | { tipo: "terminar" }
  | { tipo: "retroceder" }
  | { tipo: "cancelar" };

/** La prótesis ya guardada que pasa por la pieza, como pilar o en el medio. */
function protesisQueContiene(v: ValorOdontograma, pieza: string): TramoDeProtesis | undefined {
  const sola: TramoDeProtesis = { tipo: "fija", desde: pieza, hasta: pieza, color: "rojo" };
  return (v.protesis ?? []).find((t) => seSuperponen(t, sola, ORDEN));
}

/** Por qué una pieza no puede ser pilar de la prótesis nueva, o null. */
function errorDePilar(ctx: ContextoDeProtesis, pieza: string): string | null {
  const otra = protesisQueContiene(ctx.valor, pieza);
  if (otra) {
    const [a, b] = extremosDe(otra);
    return `La pieza ${pieza} ya es parte de la prótesis de ${a} a ${b}.`;
  }
  return conflictoDePilar(pieza, ctx.valor.piezas?.[pieza], ctx.color);
}

/** Por qué la prótesis no puede terminar en `hasta`, o null. */
function errorDeFin(ctx: ContextoDeProtesis, desde: string, hasta: string): string | null {
  if (hasta === desde) return "Una prótesis une al menos dos piezas.";
  if (filaDe(desde) !== filaDe(hasta)) return "Una prótesis une piezas de la misma arcada.";
  const tramo: TramoDeProtesis = { tipo: ctx.tipo, desde, hasta, color: ctx.color };
  return errorDePilar(ctx, hasta) ?? (seSuperponeConOtro(ctx.valor, tramo) ? PROTESIS_SUPERPUESTA : null);
}

/** Los dos extremos de la operación: la pieza de cada campo y por qué no
 *  sirve. `pieza` null con `error` es un número que no es de la dentición
 *  (va debajo del campo); `pieza` con `error`, una que no puede ser pilar
 *  (va en el panel, junto al botón apagado). */
export function leerOperacion(op: OperacionDeProtesis, ctx: ContextoDeProtesis): { desde: PiezaEscrita; hasta: PiezaEscrita } {
  const desde = leerPiezaEscrita(op.desde, ctx.denticion);
  const hasta = leerPiezaEscrita(op.hasta, ctx.denticion);
  return {
    desde: desde.pieza ? { pieza: desde.pieza, error: errorDePilar(ctx, desde.pieza) } : desde,
    hasta: hasta.pieza
      ? { pieza: hasta.pieza, error: desde.pieza ? errorDeFin(ctx, desde.pieza, hasta.pieza) : errorDePilar(ctx, hasta.pieza) }
      : hasta,
  };
}

const sirve = (p: PiezaEscrita) => p.pieza !== null && p.error === null;

/** El paso siguiente de la operación. Tocar en el inicio solo cambia la
 *  pieza elegida; en el fin, el fin. Escribir los dos extremos válidos
 *  salta a confirmar. */
export function operarProtesis(op: OperacionDeProtesis, accion: AccionDeProtesis, ctx: ContextoDeProtesis): OperacionDeProtesis {
  switch (accion.tipo) {
    case "tocar":
      return op.paso === "inicio" ? { ...op, desde: accion.pieza } : { ...op, paso: "fin", hasta: accion.pieza };
    case "escribir":
      return escribir(op, accion.campo, accion.texto, ctx);
    case "empezar":
      return op.paso === "inicio" && sirve(leerOperacion(op, ctx).desde) ? { ...op, paso: "fin" } : op;
    case "terminar":
      return op.paso === "fin" && ambosSirven(op, ctx) ? { ...op, paso: "confirmar" } : op;
    case "retroceder":
      return { ...op, paso: op.paso === "confirmar" ? "fin" : "inicio" };
    case "cancelar":
      return OPERACION_VACIA;
  }
}

/** Cambiar el inicio vuelve a elegirlo; cambiar el fin ya confirmado
 *  vuelve a elegir el fin. */
function escribir(op: OperacionDeProtesis, campo: "desde" | "hasta", texto: string, ctx: ContextoDeProtesis): OperacionDeProtesis {
  const paso: PasoDeProtesis = campo === "desde" ? "inicio" : op.paso === "confirmar" ? "fin" : op.paso;
  const nueva = { ...op, [campo]: texto, paso };
  return paso === "inicio" && ambosSirven(nueva, ctx) ? { ...nueva, paso: "confirmar" } : nueva;
}

/** Si la prótesis se puede guardar tal como está. */
export function ambosSirven(op: OperacionDeProtesis, ctx: ContextoDeProtesis): boolean {
  const { desde, hasta } = leerOperacion(op, ctx);
  return sirve(desde) && sirve(hasta);
}

/** El tramo que se guarda al confirmar. */
export function tramoDeLaOperacion(op: OperacionDeProtesis, ctx: ContextoDeProtesis): TramoDeProtesis {
  return { tipo: ctx.tipo, desde: op.desde, hasta: op.hasta, color: ctx.color };
}

// --- Las filas, como en el papel ----------------------------------------

export interface FilaDelOdontograma {
  id: FilaDeOdontograma;
  piezas: readonly string[];
  /** En qué columna de la grilla de las permanentes arranca: las
   *  temporarias van centradas (tres piezas más adentro). */
  desde: number;
  superior: boolean;
}

/** Con `temporariasPrimero` (el odontograma pediátrico) las temporarias van
 *  arriba, como en el papel del Anexo de odontopediatría. */
export function filasDe(denticion: Denticion, temporariasPrimero = false): FilaDelOdontograma[] {
  const permanentes: FilaDelOdontograma[] = [];
  const temporarias: FilaDelOdontograma[] = [];
  if (denticion !== "temporaria") {
    const p = piezasDe("permanente");
    permanentes.push({ id: "sup-perm", piezas: p.slice(0, 16), desde: 0, superior: true });
    permanentes.push({ id: "inf-perm", piezas: p.slice(16), desde: 0, superior: false });
  }
  if (denticion !== "permanente") {
    const t = piezasDe("temporaria");
    const desde = denticion === "ambas" ? 3 : 0;
    temporarias.push({ id: "sup-temp", piezas: t.slice(0, 10), desde, superior: true });
    temporarias.push({ id: "inf-temp", piezas: t.slice(10), desde, superior: false });
  }
  return temporariasPrimero ? [...temporarias, ...permanentes] : [...permanentes, ...temporarias];
}

/** A qué pieza va el foco con una tecla, o null si la tecla no mueve.
 *  Izquierda/derecha recorren la fila; arriba/abajo pasan a la pieza de la
 *  fila vecina que está debajo (o la más cercana); Inicio/Fin, a los
 *  extremos de la fila. */
export function moverFoco(filas: FilaDelOdontograma[], pieza: string, tecla: string): string | null {
  const f = filas.findIndex((fila) => fila.piezas.includes(pieza));
  if (f === -1) return null;
  const fila = filas[f];
  const i = fila.piezas.indexOf(pieza);
  const ultima = fila.piezas.length - 1;
  switch (tecla) {
    case "ArrowLeft":
      return fila.piezas[Math.max(i - 1, 0)];
    case "ArrowRight":
      return fila.piezas[Math.min(i + 1, ultima)];
    case "Home":
      return fila.piezas[0];
    case "End":
      return fila.piezas[ultima];
    case "ArrowUp":
    case "ArrowDown": {
      const vecina = filas[f + (tecla === "ArrowUp" ? -1 : 1)];
      if (!vecina) return pieza;
      const columna = fila.desde + i - vecina.desde;
      return vecina.piezas[Math.min(Math.max(columna, 0), vecina.piezas.length - 1)];
    }
    default:
      return null;
  }
}

/** Dónde cae una pieza en cada tramo que la toca, de izquierda a derecha
 *  en el papel: el primer extremo, el medio o el último. Sirve para
 *  dibujar la línea de la prótesis por el centro de cada pieza. */
export type TramoEnPieza = { tramo: TramoDeProtesis; indice: number; lugar: "inicio" | "medio" | "fin" };

export function tramosEnPieza(filas: FilaDelOdontograma[], protesis: TramoDeProtesis[] | undefined, pieza: string): TramoEnPieza[] {
  const fila = filas.find((f) => f.piezas.includes(pieza));
  if (!fila || !protesis) return [];
  const i = fila.piezas.indexOf(pieza);
  const resultado: TramoEnPieza[] = [];
  protesis.forEach((tramo, indice) => {
    const a = fila.piezas.indexOf(tramo.desde);
    const b = fila.piezas.indexOf(tramo.hasta);
    if (a === -1 || b === -1 || a === b) return;
    const [izq, der] = a < b ? [a, b] : [b, a];
    if (i < izq || i > der) return;
    resultado.push({ tramo, indice, lugar: i === izq ? "inicio" : i === der ? "fin" : "medio" });
  });
  return resultado;
}
