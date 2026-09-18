// El nombre de la clínica sobre la foto de portada (Fase 4.4, pedido del
// cliente: "poder poner el nombre del consultorio sobre la foto de portada y
// poder cambiarle el color al nombre solo").
//
// El color es un SET CURADO y no un color libre, igual criterio que el resto
// de la personalización (decisión #5 de fase4-personalizar-pagina.md: la
// individualización vive dentro de opciones ya resueltas). Acá hay una razón
// extra: el texto va sobre una foto que no controlamos, así que cada color
// trae el VELO (un degradé) que lo hace legible — un color libre pediría
// adivinar el velo, y un texto claro sobre un velo claro no se lee. Espejo de
// coloresNombreValidos (internal/http/pagina_publica.go) y del CHECK
// chk_pagina_publica_nombre_color: los tres cambian juntos.

export type IdColorNombre = "blanco" | "negro" | "dorado" | "celeste";

export interface ColorNombre {
  id: IdColorNombre;
  nombre: string;
  hex: string;
  /**
   * Qué velo lleva la foto para que este color se lea: los claros van sobre
   * un degradé oscuro, el oscuro sobre uno claro.
   */
  velo: "oscuro" | "claro";
}

export const COLORES_NOMBRE: ColorNombre[] = [
  { id: "blanco", nombre: "Blanco", hex: "#ffffff", velo: "oscuro" },
  { id: "negro", nombre: "Negro", hex: "#1f1c17", velo: "claro" },
  { id: "dorado", nombre: "Dorado", hex: "#f2d27a", velo: "oscuro" },
  { id: "celeste", nombre: "Celeste", hex: "#cfe9f5", velo: "oscuro" },
];

/** El de una página que no eligió ninguno (el backend guarda ""). */
export const COLOR_NOMBRE_POR_DEFECTO: IdColorNombre = "blanco";

/** Resuelve un id guardado; uno vacío o desconocido cae al default en vez de romper. */
export function colorDeNombre(id: string | null | undefined): ColorNombre {
  return COLORES_NOMBRE.find((c) => c.id === id) ?? COLORES_NOMBRE.find((c) => c.id === COLOR_NOMBRE_POR_DEFECTO)!;
}
