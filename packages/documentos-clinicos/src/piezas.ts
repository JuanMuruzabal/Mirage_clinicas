// Las piezas dentarias en notación FDI de dos dígitos — el "sistema dígito
// dos" que exige la Ley 26.812 para el registro odontológico. El primer
// dígito es el cuadrante (1 a 4 permanentes, 5 a 8 temporarios) y el
// segundo la pieza, contando desde la línea media.
//
// El orden de las listas es el del odontograma de los modelos del Colegio:
// de derecha a izquierda del paciente, arriba y después abajo.

export type Denticion = "permanente" | "temporaria" | "ambas";

function tramo(cuadrante: number, desde: number, hasta: number): string[] {
  const paso = desde > hasta ? -1 : 1;
  const piezas: string[] = [];
  for (let n = desde; paso > 0 ? n <= hasta : n >= hasta; n += paso) piezas.push(`${cuadrante}${n}`);
  return piezas;
}

/** Las 32 permanentes: 18–11 · 21–28 arriba, 48–41 · 31–38 abajo. */
export const PIEZAS_PERMANENTES: readonly string[] = [
  ...tramo(1, 8, 1),
  ...tramo(2, 1, 8),
  ...tramo(4, 8, 1),
  ...tramo(3, 1, 8),
];

/** Las 20 temporarias: 55–51 · 61–65 arriba, 85–81 · 71–75 abajo. */
export const PIEZAS_TEMPORARIAS: readonly string[] = [
  ...tramo(5, 5, 1),
  ...tramo(6, 1, 5),
  ...tramo(8, 5, 1),
  ...tramo(7, 1, 5),
];

export function piezasDe(denticion: Denticion): readonly string[] {
  if (denticion === "permanente") return PIEZAS_PERMANENTES;
  if (denticion === "temporaria") return PIEZAS_TEMPORARIAS;
  return [...PIEZAS_PERMANENTES, ...PIEZAS_TEMPORARIAS];
}

export function esPiezaValida(pieza: string, denticion: Denticion = "ambas"): boolean {
  return piezasDe(denticion).includes(pieza);
}
