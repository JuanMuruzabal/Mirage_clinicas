// La LÁMINA: el documento que se completa es la página original del
// Colegio con lo cargado escrito sobre sus renglones, como quien llena el
// papel (pedido del cliente, 2026-09-28: "debe ser igual en todos los
// aspectos, porque este es el documento que se guardará y se generará el
// PDF"). Un calco en HTML nunca iba a quedar igual —el modelo usa Tahoma—;
// la página misma, sí.
//
// Cada plantilla declara, en puntos del PDF original (1/72 de pulgada),
// dónde va cada dato (una ZONA: su renglón, su ancho, cuántas líneas tiene)
// y dónde va cada firma. Este módulo arma el texto de cada zona y lo
// COMPONE: elige el tamaño de letra y corta las líneas para que entre.
//
// La composición es determinista y se hace IGUAL en Go
// (internal/documentos/lamina.go): con los anchos de Helvetica —que Arial y
// Arimo comparten, así que la pantalla corta las líneas en el mismo lugar—
// y la misma aritmética. La API congela la composición al terminar el
// documento; la vista sellada y el PDF dibujan esa composición congelada,
// no la recalculan. El fixture que genera este paquete verifica que Go
// componga byte a byte lo mismo que la pantalla.
import { campoPorId, MARCA_DE_ZONA, type Plantilla, type Zona } from "./esquema";
import { anchoEnUnidades } from "./metricas";
import { NO_CONSIGNA, type Contexto, type Modo } from "./texto";
import { fechaComoTexto, estaVacio, valorComoTexto, type ErrorDeCampo, type Valores } from "./valores";

export interface LineaCompuesta {
  x: number;
  y: number;
  texto: string;
}

export interface ZonaCompuesta {
  zona: string;
  pagina: number;
  tamano: number;
  lineas: LineaCompuesta[];
  /** Ni al tamaño mínimo entra: al terminar es un error. */
  desborda: boolean;
  /** Ningún dato de la zona está cargado. */
  vacia: boolean;
}

export const TAMANO_BASE = 10;
const PASO = 0.5;

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "2026-09-07" → "07" / "09" / "2026" / "26". */
export function parteDeFecha(iso: string, parte: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  switch (parte) {
    case "dia":
      return m[3];
    case "mes":
      return m[2];
    case "anio":
      return m[1];
    case "anio2":
      return m[1].slice(2);
  }
  return "";
}

/** El texto de una zona con los valores adentro, y si está vacía (ningún
 *  campo de la zona cargado; la fecha del sistema no cuenta). Un campo
 *  vacío en una zona que tiene otros cargados queda en blanco en un
 *  borrador y dice "No consigna" en un documento terminado. */
export function textoDeZona(
  zona: Zona,
  plantilla: Plantilla,
  valores: Valores,
  contexto: Contexto,
  modo: Modo,
): { texto: string; vacia: boolean } {
  let campos = 0;
  let cargados = 0;
  const texto = zona.texto.replace(MARCA_DE_ZONA, (_, nombre: string, parte?: string) => {
    if (nombre === "sistema.fecha") return fechaComoTexto(contexto.fecha);
    const campo = campoPorId(plantilla, nombre);
    if (!campo) return "";
    campos += 1;
    const valor = valores[nombre];
    if (estaVacio(campo, valor)) return modo === "sellado" ? NO_CONSIGNA : "";
    cargados += 1;
    if (parte) return typeof valor === "string" ? parteDeFecha(valor, parte) : "";
    return valorComoTexto(campo, valor);
  });
  return { texto: texto.replace(/\r\n?/g, "\n"), vacia: campos > 0 && cargados === 0 };
}

function cabe(texto: string, tamano: number, ancho: number): boolean {
  return anchoEnUnidades(texto) * tamano <= ancho * 1000 + 1e-6;
}

/** Corta un texto en líneas que entran en `ancho` a ese tamaño: por
 *  párrafo (los saltos de línea se respetan), por palabra, y una palabra
 *  más larga que la línea, por caracteres. */
export function envolver(texto: string, ancho: number, tamano: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    const palabras = parrafo.split(/[ \t]+/).filter((p) => p !== "");
    if (palabras.length === 0) {
      lineas.push("");
      continue;
    }
    let linea = "";
    for (const original of palabras) {
      let palabra = original;
      const candidata = linea === "" ? palabra : `${linea} ${palabra}`;
      if (cabe(candidata, tamano, ancho)) {
        linea = candidata;
        continue;
      }
      if (linea !== "") lineas.push(linea);
      // Un carácter solo queda en su renglón aunque no entre: si no, la
      // palabra se vaciaría y dejaría un renglón en blanco.
      while (!cabe(palabra, tamano, ancho) && [...palabra].length > 1) {
        const caracteres = [...palabra];
        let corte = 1;
        while (corte < caracteres.length && cabe(caracteres.slice(0, corte + 1).join(""), tamano, ancho)) corte += 1;
        lineas.push(caracteres.slice(0, corte).join(""));
        palabra = caracteres.slice(corte).join("");
      }
      linea = palabra;
    }
    lineas.push(linea);
  }
  return lineas;
}

/** Compone el texto de una zona: el tamaño más grande (de 0,5 en 0,5 pt,
 *  hasta el mínimo) con el que entra en sus líneas. */
export function componerZona(zona: Zona, texto: string): Omit<ZonaCompuesta, "vacia"> {
  const maximoDeLineas = zona.lineas ?? 1;
  const base = zona.tamano ?? TAMANO_BASE;
  const minimo = zona.minimo ?? redondear2(base * 0.6);
  const interlineado = zona.interlineado ?? redondear2(base * 1.2);
  const armar = (tamano: number, lineas: string[], desborda: boolean) => ({
    zona: zona.id,
    pagina: zona.pagina,
    tamano,
    desborda,
    lineas: lineas.map((t, i) => ({
      x: zona.alinear === "centro" ? redondear2(zona.x + (zona.ancho - (anchoEnUnidades(t) * tamano) / 1000) / 2) : zona.x,
      y: redondear2(zona.y + i * interlineado),
      texto: t,
    })),
  });
  for (let tamano = base; tamano >= minimo - 1e-9; tamano = redondear2(tamano - PASO)) {
    const lineas = envolver(texto, zona.ancho, tamano);
    if (lineas.length <= maximoDeLineas) return armar(tamano, lineas, false);
  }
  return armar(minimo, envolver(texto, zona.ancho, minimo).slice(0, maximoDeLineas), true);
}

/** La lámina entera compuesta. En un borrador, una zona vacía queda sin
 *  líneas (la pantalla dibuja la pista); terminada, dice "No consigna" (o
 *  lo que la zona declare): en la historia clínica no quedan huecos donde
 *  escribir después (Decreto 1089/2012, art. 15). */
export function armarLamina(plantilla: Plantilla, valores: Valores, contexto: Contexto, modo: Modo): ZonaCompuesta[] {
  if (!plantilla.lamina) return [];
  return plantilla.lamina.zonas.map((zona) => {
    const { texto, vacia } = textoDeZona(zona, plantilla, valores, contexto, modo);
    if (vacia && modo === "borrador") {
      return { zona: zona.id, pagina: zona.pagina, tamano: zona.tamano ?? TAMANO_BASE, lineas: [], desborda: false, vacia: true };
    }
    return { ...componerZona(zona, vacia ? (zona.vacio ?? NO_CONSIGNA) : texto), vacia };
  });
}

/** Los campos de una zona, en orden. */
export function camposDeZona(zona: Zona): string[] {
  return [...zona.texto.matchAll(MARCA_DE_ZONA)].map((m) => m[1]).filter((n) => n !== "sistema.fecha");
}

/** Lo que no entra en el documento: un error por campo, en el primero de
 *  cada zona que desborda. */
export function validarLamina(plantilla: Plantilla, valores: Valores, contexto: Contexto): ErrorDeCampo[] {
  if (!plantilla.lamina) return [];
  const errores: ErrorDeCampo[] = [];
  const compuestas = armarLamina(plantilla, valores, contexto, "sellado");
  plantilla.lamina.zonas.forEach((zona, i) => {
    if (!compuestas[i].desborda) return;
    const campo = camposDeZona(zona)[0] ?? zona.id;
    if (!errores.some((e) => e.campo === campo)) {
      errores.push({ campo, mensaje: "No entra en el espacio del documento: acortalo." });
    }
  });
  return errores;
}
