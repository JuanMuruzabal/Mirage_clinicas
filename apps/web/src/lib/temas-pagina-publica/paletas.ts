import type { TokensTema } from "@dental-mirage/prisma-engine";

// Catálogo de paletas de la página pública (Fase 4.3, docs/Fases post
// MVP/Fase 4/fase4-personalizar-pagina.md) — temas prediseñados por
// Mirage, el owner elige uno como base y después una variante de color
// DENTRO de ese tema (nunca un hex libre).
//
// Mismo mecanismo que temaTipoConsulta() en turno-format.ts: cada
// variante es UN hex ancla, fondo/texto se derivan en runtime con
// color-mix() — evita mantener pares fondo/texto verificados a mano por
// cada combinación posible. Acá el fondo se mezcla con el fondo BASE del
// tema (no blanco puro, como sí hace tipo_consulta) para que cada tema
// conserve su propia identidad de fondo.
//
// La aplicación real de esto en ClinicaPublicaTemplate (CSS custom
// properties, --color-tema-*) es la Fase 4.5 — acá solo el catálogo y su
// derivación, listos para usarse.

export interface VariantePaleta {
  id: string;
  nombre: string;
  /** Hex ancla — el único valor "de verdad" de la variante. */
  hex: string;
}

export interface Paleta {
  id: string;
  nombre: string;
  descripcion: string;
  /** Fondo base del tema (antes de mezclar con el hex de la variante). */
  fondoBase: string;
  variantes: VariantePaleta[];
  // PE-2: el resto de la paleta del tema. Opcionales: sin ellos valen los de
  // antes de PE-2 (marfil, grafito, arena — los defaults de `.pp-raiz` en
  // globals.css), así que los cinco temas originales no cambian.
  /** Fondo de las tarjetas. */
  superficie?: string;
  /** Color del texto del cuerpo y los títulos. */
  texto?: string;
  /** Color de los bordes finos. */
  borde?: string;
  /**
   * Tema de fondo oscuro: el acento se aclara (mezcla con blanco) en vez de
   * oscurecerse, y los textos sobre acento van en el color del fondo.
   */
  oscuro?: boolean;
  /** Tokens de diseño por defecto del tema (PE-2); los que falten valen TOKENS_POR_DEFECTO. */
  tokens?: TokensTema;
}

export const PALETAS_PAGINA_PUBLICA: Paleta[] = [
  {
    id: "calido",
    nombre: "Cálido",
    descripcion: "Continuidad con el panel — la misma piel salvia/terracota de siempre.",
    fondoBase: "#f6f2ea",
    variantes: [
      { id: "calido-1", nombre: "Salvia", hex: "#6e8f72" },
      { id: "calido-2", nombre: "Terracota", hex: "#c97f5a" },
      { id: "calido-3", nombre: "Grafito cálido", hex: "#8a7a5c" },
    ],
  },
  {
    id: "clinico",
    nombre: "Clínico",
    descripcion: "Azules y teales fríos — confianza médica.",
    fondoBase: "#eef3f5",
    variantes: [
      { id: "clinico-1", nombre: "Teal", hex: "#3f7d7a" },
      { id: "clinico-2", nombre: "Azul acero", hex: "#3d6a8a" },
      { id: "clinico-3", nombre: "Celeste profundo", hex: "#4a6fa5" },
    ],
  },
  {
    id: "moderno",
    nombre: "Moderno",
    descripcion: "Minimal, un acento vivo sobre grafito neutro.",
    fondoBase: "#f2f1ee",
    variantes: [
      { id: "moderno-1", nombre: "Coral", hex: "#e0553f" },
      { id: "moderno-2", nombre: "Violeta", hex: "#6b5ca5" },
      { id: "moderno-3", nombre: "Grafito puro", hex: "#3a3a3a" },
    ],
  },
  {
    id: "natural",
    nombre: "Natural",
    descripcion: "Verdes orgánicos — calma, spa dental.",
    fondoBase: "#eef2ea",
    variantes: [
      { id: "natural-1", nombre: "Musgo", hex: "#5a7d4e" },
      { id: "natural-2", nombre: "Eucalipto", hex: "#4f8f7d" },
      { id: "natural-3", nombre: "Oliva", hex: "#7d8a4e" },
    ],
  },
  {
    id: "clasico",
    nombre: "Clásico",
    descripcion: "Navy y dorado — tradicional, serio.",
    fondoBase: "#f4f1e8",
    variantes: [
      { id: "clasico-1", nombre: "Navy", hex: "#2c3e5c" },
      { id: "clasico-2", nombre: "Dorado", hex: "#a8823c" },
      { id: "clasico-3", nombre: "Burdeos", hex: "#7a3b3b" },
    ],
  },
  // PE-2: los dos primeros temas que usan tokens además de color.
  {
    id: "editorial",
    nombre: "Editorial",
    descripcion: "Blanco limpio, bordes rectos y mucho aire — como una revista.",
    fondoBase: "#faf8f4",
    superficie: "#ffffff",
    texto: "#1f1d1a",
    borde: "#e4ded3",
    variantes: [
      { id: "editorial-1", nombre: "Tinta", hex: "#1f3a5f" },
      { id: "editorial-2", nombre: "Vino", hex: "#7b2d3b" },
      { id: "editorial-3", nombre: "Bosque", hex: "#2f5d4a" },
    ],
    tokens: { forma: "recta", densidad: "amplia", superficie: "plana", boton: "recto", menu: "subrayado" },
  },
  {
    id: "oscuro",
    nombre: "Oscuro",
    descripcion: "Fondo profundo y acentos claros — sobrio y moderno.",
    fondoBase: "#15181b",
    superficie: "#1f2327",
    texto: "#ece8e1",
    borde: "#363c42",
    oscuro: true,
    variantes: [
      { id: "oscuro-1", nombre: "Ámbar", hex: "#e0a458" },
      { id: "oscuro-2", nombre: "Menta", hex: "#6cc4a4" },
      { id: "oscuro-3", nombre: "Lavanda", hex: "#a99be0" },
    ],
    tokens: { forma: "redonda", superficie: "plana" },
  },
];

export interface TemaColorDerivado {
  fondo: string;
  texto: string;
  acento: string;
}

// Mismos porcentajes que temaTipoConsulta() (turno-format.ts) — 25%/65%
// ya está verificado en el resto del producto, no hay motivo para
// inventar otros acá. En un tema OSCURO se invierte (PE-2): el texto de
// acento se aclara mezclándolo con blanco, y el fondo suave queda oscuro —
// oscurecer un acento sobre un fondo casi negro lo dejaría ilegible. Los
// porcentajes de cada caso los mide temas.test.ts (AA).
export const MEZCLA = {
  claro: { fondo: 25, texto: 65, con: "black" },
  oscuro: { fondo: 22, texto: 70, con: "white" },
} as const;

export function derivarColorDeVariante(
  paleta: Pick<Paleta, "fondoBase" | "oscuro">,
  variante: Pick<VariantePaleta, "hex">,
): TemaColorDerivado {
  const m = paleta.oscuro ? MEZCLA.oscuro : MEZCLA.claro;
  return {
    fondo: `color-mix(in srgb, ${variante.hex} ${m.fondo}%, ${paleta.fondoBase})`,
    texto: `color-mix(in srgb, ${variante.hex} ${m.texto}%, ${m.con})`,
    acento: variante.hex,
  };
}

export function paletaPorId(id: string): Paleta | undefined {
  return PALETAS_PAGINA_PUBLICA.find((p) => p.id === id);
}

export function variantePorId(paleta: Paleta, varianteId: string): VariantePaleta | undefined {
  return paleta.variantes.find((v) => v.id === varianteId);
}
