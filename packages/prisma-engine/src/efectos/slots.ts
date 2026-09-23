import type { DefinicionSlotAnimable } from "./catalogo";

const ENTRADAS = ["aparicion-suave", "deslizar-suave", "revelado-scroll"] as const;
const TEXTO = [...ENTRADAS, "brillo-texto", "degrade-texto", "frases-rotativas", "palabras", "subrayado"] as const;
const TARJETA = [...ENTRADAS, "inclinacion", "foco-cursor"] as const;
const IMAGEN = [...ENTRADAS, "inclinacion", "reflejo"] as const;
const NUMERO = [...ENTRADAS, "conteo"] as const;
const BOTON = ["borde-estrella", "magnetico", "chispas"] as const;

export const SLOTS_TEXTO: readonly DefinicionSlotAnimable[] = [
  { id: "titulo", etiqueta: "Título", objetivo: "texto", efectos: TEXTO },
  { id: "texto", etiqueta: "Texto", objetivo: "texto", efectos: TEXTO },
];
export const SLOTS_TARJETA: readonly DefinicionSlotAnimable[] = [
  { id: "tarjeta", etiqueta: "Tarjetas", objetivo: "tarjeta", efectos: TARJETA },
  ...SLOTS_TEXTO,
];
export const SLOTS_IMAGEN: readonly DefinicionSlotAnimable[] = [
  { id: "imagen", etiqueta: "Imagen", objetivo: "imagen", efectos: IMAGEN },
];
export const SLOTS_ESTADISTICAS: readonly DefinicionSlotAnimable[] = [
  { id: "numero", etiqueta: "Números", objetivo: "numero", efectos: NUMERO },
  { id: "tarjeta", etiqueta: "Tarjetas", objetivo: "tarjeta", efectos: TARJETA },
  ...SLOTS_TEXTO,
];
export const SLOTS_CONTACTO: readonly DefinicionSlotAnimable[] = [
  ...SLOTS_TARJETA,
  { id: "boton", etiqueta: "Enlaces y botones", objetivo: "boton", efectos: BOTON },
];
export const SLOTS_GALERIA: readonly DefinicionSlotAnimable[] = [
  { id: "tarjeta", etiqueta: "Galería", objetivo: "tarjeta", efectos: TARJETA },
  ...SLOTS_IMAGEN,
];
export const SLOTS_FOTO: readonly DefinicionSlotAnimable[] = SLOTS_IMAGEN;
