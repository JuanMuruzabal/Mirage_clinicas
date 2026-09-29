// Las hojas de muestra de la pila de modelos (pedido del cliente,
// 2026-09-29). La pila apila el documento elegido con el anterior y el
// siguiente del carrusel, pero hoy hay un solo modelo cargado (los demás
// consentimientos llegan con la 5.4): sin muestras no habría nada que
// apilar ni que barajar. Se recorren con las flechas como un documento
// más, no se pueden completar, y desaparecen solas en cuanto haya tres
// modelos de verdad (`muestrasSiFaltan`). No son un adelanto de ningún
// documento: por eso no llevan el nombre de uno.
import type { TipoDePlantilla } from "@dental-mirage/documentos-clinicos";

export interface ModeloDeMuestra {
  id: string;
  nombre: string;
  tipo: TipoDePlantilla;
  muestra: true;
  /** El color de la franja de arriba de la hoja: al barajar, distingue una de otra. */
  tono: "salvia" | "terracota" | "acero";
}

/** Con cuántos modelos la pila muestra las dos hojas de atrás. */
export const MODELOS_PARA_LA_PILA = 3;

const MUESTRAS: ModeloDeMuestra[] = [
  { id: "muestra-1", nombre: "Modelo de muestra 1", tipo: "consentimiento", muestra: true, tono: "salvia" },
  { id: "muestra-2", nombre: "Modelo de muestra 2", tipo: "consentimiento", muestra: true, tono: "terracota" },
  { id: "muestra-3", nombre: "Modelo de muestra 3", tipo: "consentimiento", muestra: true, tono: "acero" },
];

/** Las muestras que hacen falta para ver la pila: ninguna desde que hay
 *  `MODELOS_PARA_LA_PILA` modelos reales. */
export function muestrasSiFaltan(modelosReales: number): ModeloDeMuestra[] {
  return modelosReales >= MODELOS_PARA_LA_PILA ? [] : MUESTRAS;
}

export function esMuestra(modelo: object): modelo is ModeloDeMuestra {
  return "muestra" in modelo && modelo.muestra === true;
}
