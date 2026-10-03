// La lógica pura del control del odontograma (Fase 5.5): qué valor queda
// después de cada toque, y cómo se recorren las piezas con el teclado. El
// componente (`campo-odontograma.tsx`) solo dibuja y llama a esto.
//
// Cada función devuelve el valor LIMPIO: sin piezas vacías ni listas
// vacías, y `undefined` cuando no queda nada (el editor borra el campo, el
// mismo criterio que un texto que se vacía).
import {
  esObjeto,
  filaDe,
  piezasDe,
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
export type Herramienta = "caras" | MarcaDePieza | TipoDeProtesis;

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

const mismasPiezas = (t: TramoDeProtesis, a: string, b: string) => (t.desde === a && t.hasta === b) || (t.desde === b && t.hasta === a);

/** Suma un tramo; uno del mismo tipo entre las mismas dos piezas se
 *  reemplaza (cambiarle el color no lo duplica). */
export function agregarTramo(v: ValorOdontograma, tramo: TramoDeProtesis) {
  const otros = (v.protesis ?? []).filter((t) => !(t.tipo === tramo.tipo && mismasPiezas(t, tramo.desde, tramo.hasta)));
  return limpiar({ ...v, protesis: [...otros, tramo] });
}

export function quitarTramo(v: ValorOdontograma, indice: number) {
  return limpiar({ ...v, protesis: (v.protesis ?? []).filter((_, i) => i !== indice) });
}

export function conExistentes(v: ValorOdontograma, existentes: number | undefined) {
  const nuevo = { ...v, existentes };
  if (existentes === undefined) delete nuevo.existentes;
  return limpiar(nuevo);
}

/** Lo que pasa con el segundo toque de una prótesis. */
export type CierreDeTramo = { tipo: "cancelado" } | { tipo: "otra-fila" } | { tipo: "tramo"; desde: string; hasta: string };

export function cerrarTramo(inicio: string, pieza: string): CierreDeTramo {
  if (inicio === pieza) return { tipo: "cancelado" };
  if (filaDe(inicio) !== filaDe(pieza)) return { tipo: "otra-fila" };
  return { tipo: "tramo", desde: inicio, hasta: pieza };
}

// --- Las filas, como en el papel ----------------------------------------

export interface FilaDelOdontograma {
  id: FilaDeOdontograma;
  piezas: readonly string[];
  /** En qué columna de la grilla de las permanentes arranca: las
   *  temporarias van centradas debajo (tres piezas más adentro). */
  desde: number;
  superior: boolean;
}

export function filasDe(denticion: Denticion): FilaDelOdontograma[] {
  const filas: FilaDelOdontograma[] = [];
  if (denticion !== "temporaria") {
    const p = piezasDe("permanente");
    filas.push({ id: "sup-perm", piezas: p.slice(0, 16), desde: 0, superior: true });
    filas.push({ id: "inf-perm", piezas: p.slice(16), desde: 0, superior: false });
  }
  if (denticion !== "permanente") {
    const t = piezasDe("temporaria");
    const desde = denticion === "ambas" ? 3 : 0;
    filas.push({ id: "sup-temp", piezas: t.slice(0, 10), desde, superior: true });
    filas.push({ id: "inf-temp", piezas: t.slice(10), desde, superior: false });
  }
  return filas;
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
 *  dibujar la barra de la prótesis debajo de cada pieza. */
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
