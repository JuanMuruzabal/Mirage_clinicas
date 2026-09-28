// Cómo se lee un documento: el cuerpo de la plantilla con los valores
// adentro.
//
// Hay dos usos, y por eso dos salidas:
//   - `segmentar` parte un texto en pedazos fijos y pedazos que son campos.
//     Lo usa el calco del editor para resaltar lo cargado y, en un
//     borrador, dibujar el hueco de lo que falta con el nombre del campo.
//   - `armarCuerpo` devuelve el documento en texto plano, bloque por
//     bloque. Es lo que la API congela al terminar (lo que el paciente lee
//     y firma), y lo que el fixture compara contra la versión en Go.
//
// Un campo vacío se lee distinto según el momento: en un borrador es un
// hueco; en un documento terminado es "No consigna", porque el Decreto
// 1089/2012 (art. 15) prohíbe dejar espacios en blanco en la historia
// clínica — un hueco en un documento firmado es un lugar donde alguien
// podría escribir después.
import { campoPorId, MARCA, type Bloque, type Plantilla } from "./esquema";
import { fechaComoTexto, valorComoTexto, type Valores } from "./valores";

export const NO_CONSIGNA = "No consigna";
export const HUECO = "____";

export type Modo = "borrador" | "sellado";

export interface Contexto {
  /** El día del documento, AAAA-MM-DD en hora de Córdoba: el de terminarlo
   *  o, en un borrador, hoy. */
  fecha: string;
}

export type Segmento =
  | { tipo: "texto"; texto: string }
  | { tipo: "campo"; campoId: string; texto: string; vacio: boolean };

function valorDeMarca(marca: string, plantilla: Plantilla, valores: Valores, contexto: Contexto): { campoId: string; texto: string } {
  if (marca === "sistema.fecha") return { campoId: marca, texto: fechaComoTexto(contexto.fecha) };
  const campo = campoPorId(plantilla, marca);
  return { campoId: marca, texto: campo ? valorComoTexto(campo, valores[marca]) : "" };
}

export function segmentar(texto: string, plantilla: Plantilla, valores: Valores, contexto: Contexto): Segmento[] {
  const segmentos: Segmento[] = [];
  let desde = 0;
  for (const m of texto.matchAll(MARCA)) {
    const indice = m.index ?? 0;
    if (indice > desde) segmentos.push({ tipo: "texto", texto: texto.slice(desde, indice) });
    const { campoId, texto: valor } = valorDeMarca(m[1], plantilla, valores, contexto);
    segmentos.push({ tipo: "campo", campoId, texto: valor, vacio: valor === "" });
    desde = indice + m[0].length;
  }
  if (desde < texto.length) segmentos.push({ tipo: "texto", texto: texto.slice(desde) });
  return segmentos;
}

function plano(segmentos: Segmento[], modo: Modo): string {
  return segmentos
    .map((s) => (s.tipo === "texto" ? s.texto : s.vacio ? (modo === "sellado" ? NO_CONSIGNA : HUECO) : s.texto))
    .join("");
}

export type BloqueArmado =
  | { t: "titulo" | "subtitulo" | "parrafo"; texto: string }
  | { t: "lista"; items: string[] }
  | { t: "campo"; campo: string; etiqueta: string; texto: string }
  | { t: "firmas" };

function armarBloque(bloque: Bloque, plantilla: Plantilla, valores: Valores, contexto: Contexto, modo: Modo): BloqueArmado {
  switch (bloque.t) {
    case "titulo":
    case "subtitulo":
    case "parrafo":
      return { t: bloque.t, texto: plano(segmentar(bloque.texto, plantilla, valores, contexto), modo) };
    case "lista":
      return { t: "lista", items: bloque.items.map((i) => plano(segmentar(i, plantilla, valores, contexto), modo)) };
    case "campo": {
      const campo = campoPorId(plantilla, bloque.campo);
      const valor = campo ? valorComoTexto(campo, valores[bloque.campo]) : "";
      return {
        t: "campo",
        campo: bloque.campo,
        etiqueta: campo?.etiqueta ?? bloque.campo,
        texto: valor !== "" ? valor : modo === "sellado" ? NO_CONSIGNA : HUECO,
      };
    }
    case "firmas":
      return { t: "firmas" };
  }
}

/** El documento en texto plano, bloque por bloque. */
export function armarCuerpo(plantilla: Plantilla, valores: Valores, contexto: Contexto, modo: Modo): BloqueArmado[] {
  return plantilla.cuerpo.map((b) => armarBloque(b, plantilla, valores, contexto, modo));
}
