// El DIBUJO (Fase 5.6b): un campo que se dibuja a mano alzada sobre un
// recuadro del papel, como el genograma de odontopediatría. Se guarda como
// trazos —el tamaño del lienzo en píxeles y los puntos de cada trazo, sin
// tiempos: no es una firma— y se compone como FIGURAS sobre la lámina, que
// se congelan igual que las del odontograma.
//
// Tiene su espejo en internal/documentos/dibujo.go y tiene que dar lo mismo:
// los mismos mensajes y las mismas coordenadas (lo verifican los casos de
// composicion/figuras.json que genera `pnpm documentos:generar`).
import type { Campo, DibujoDeLamina } from "./esquema";
import { redondear2 } from "./metricas";
import { textoCentrado, type Figura, type Punto } from "./odontograma";
import { NO_CONSIGNA, type Modo } from "./texto";
import { esObjeto, estaVacio } from "./valores";

export type CampoDibujo = Extract<Campo, { tipo: "dibujo" }>;

export interface ValorDibujo {
  /** El tamaño del lienzo en que se dibujó, en píxeles. */
  ancho: number;
  alto: number;
  /** Los puntos de cada trazo, en píxeles del lienzo, con dos decimales. */
  trazos: Punto[][];
}

export const LIENZO_MINIMO = 50;
export const LIENZO_MAXIMO = 4000;
export const MAXIMO_DE_TRAZOS = 300;
export const MAXIMO_DE_PUNTOS = 20000;

/** Lo que dice el texto del documento de un dibujo con trazos: el dibujo
 *  está en la hoja, no se puede leer como texto. */
export const DIBUJO_CONSIGNADO = "Dibujo consignado en la hoja";

/** El grosor de la línea en el papel, en puntos: el de una birome fina. */
const GROSOR_DE_TRAZO = 0.8;

const FORMA = "El dibujo no tiene la forma esperada.";
const CLAVES_DEL_VALOR = ["alto", "ancho", "trazos"];

const esNumero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function errorDeTrazo(trazo: unknown, ancho: number, alto: number): string | null {
  if (!Array.isArray(trazo)) return FORMA;
  for (const p of trazo) {
    if (!Array.isArray(p) || p.length !== 2 || !esNumero(p[0]) || !esNumero(p[1])) return FORMA;
    if (p[0] < 0 || p[0] > ancho || p[1] < 0 || p[1] > alto) return "Hay un punto fuera del lienzo.";
  }
  return null;
}

/** El primer error del valor, en este orden: la forma, el lienzo, la
 *  cantidad de trazos y, trazo por trazo, que tenga puntos, el total de
 *  puntos y cada punto. Mismo orden y mensajes que `errorDeDibujo` (Go). */
export function errorDeDibujo(valor: unknown): string | null {
  if (!esObjeto(valor) || Object.keys(valor).length !== CLAVES_DEL_VALOR.length || !CLAVES_DEL_VALOR.every((k) => k in valor)) return FORMA;
  const { ancho, alto, trazos } = valor;
  if (!esNumero(ancho) || !esNumero(alto) || !Array.isArray(trazos)) return FORMA;
  if ([ancho, alto].some((lado) => lado < LIENZO_MINIMO || lado > LIENZO_MAXIMO)) {
    return `El lienzo tiene que medir entre ${LIENZO_MINIMO} y ${LIENZO_MAXIMO} de cada lado.`;
  }
  if (trazos.length > MAXIMO_DE_TRAZOS) return `El dibujo puede tener hasta ${MAXIMO_DE_TRAZOS} trazos.`;
  let puntos = 0;
  for (const trazo of trazos) {
    if (Array.isArray(trazo) && trazo.length === 0) return "Hay un trazo sin puntos.";
    puntos += Array.isArray(trazo) ? trazo.length : 0;
    if (puntos > MAXIMO_DE_PUNTOS) return "El dibujo puede tener hasta 20.000 puntos.";
    const error = errorDeTrazo(trazo, ancho, alto);
    if (error) return error;
  }
  return null;
}

/** Vacío es SOLO un dibujo bien formado sin trazos: cualquier otra cosa la
 *  rechaza la validación, en vez de guardarse sin validar. */
export function dibujoVacio(valor: unknown): boolean {
  return esObjeto(valor) && Array.isArray(valor.trazos) && valor.trazos.length === 0 && errorDeDibujo(valor) === null;
}

/** Los trazos, del lienzo al recuadro del papel: una sola escala para los
 *  dos ejes (el dibujo no se deforma), centrado en el recuadro. Vacío y
 *  terminado, "No consigna" en el medio (Decreto 1089/2012, art. 15); en
 *  un borrador, nada. Mismo cálculo que `figurasDeDibujo` (Go). */
export function figurasDeDibujo(d: DibujoDeLamina, campo: CampoDibujo, valor: unknown, modo: Modo): Figura[] {
  if (estaVacio(campo, valor)) return modo === "sellado" ? [textoCentrado(d.pagina, NO_CONSIGNA, 10, d.x, d.ancho, d.y + d.alto / 2 + 3.5, "tinta")] : [];
  if (errorDeDibujo(valor) !== null) return [];
  const { ancho, alto, trazos } = valor as ValorDibujo;
  const escala = Math.min(d.ancho / ancho, d.alto / alto);
  const x0 = d.x + (d.ancho - ancho * escala) / 2;
  const y0 = d.y + (d.alto - alto * escala) / 2;
  return trazos.map((trazo) => ({
    tipo: "trazo",
    pagina: d.pagina,
    puntos: trazo.map(([x, y]): Punto => [redondear2(x0 + x * escala), redondear2(y0 + y * escala)]),
    color: "tinta",
    grosor: GROSOR_DE_TRAZO,
  }));
}
