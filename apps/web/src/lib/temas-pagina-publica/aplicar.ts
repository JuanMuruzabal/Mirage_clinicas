// Aplicación visual de un tema a la plantilla pública (Fase 4.5; tokens de
// diseño desde PE-2). Los catálogos (paletas.ts, tipografias.ts, y los
// tokens de @dental-mirage/prisma-engine) solo describen; esto los traduce a
// lo que la plantilla necesita: un className (las variables de next/font),
// un style (custom properties `--pp-*`) y los tokens ya resueltos, para las
// decisiones de estructura que no son CSS (qué menú, qué portada).
//
// Sin tema elegido (`tema === ""`, toda página anterior a la Fase 4) NO se
// cambia nada: la plantilla conserva su piel celeste de siempre, no se
// adopta "calido" en silencio, y los tokens de estilo se ignoran. La única
// excepción es la variante de la PORTADA, que es de layout y no de estilo:
// rige con o sin tema (ver tokens.ts en el paquete).
import type { CSSProperties } from "react";
import { TOKENS_POR_DEFECTO, resolverTokens, tokensDeConfig, type TokensResueltos, type TokensTema } from "@dental-mirage/prisma-engine";
import { derivarColorDeVariante, paletaPorId, variantePorId } from "./paletas";
import { TIPOGRAFIAS_PAGINA_PUBLICA, tipografiaPorId } from "./tipografias";
import { TIPOGRAFIAS_POR_TEMA } from "./index";

export interface EstiloDeTema {
  /** false = sin tema: la plantilla usa su aspecto original. */
  activo: boolean;
  className: string;
  style: CSSProperties;
  /** Los tokens que rigen de verdad (sin tema: los por defecto + la portada elegida). */
  tokens: TokensResueltos;
}

// Cada opción de token es un juego de custom properties. Los valores de
// TOKENS_POR_DEFECTO reproducen los defaults de `.pp-raiz` (globals.css), que
// son los de antes de PE-2 — si se cambia uno de los dos, cambiar el otro.
const FORMA: Record<TokensResueltos["forma"], Record<string, string>> = {
  recta: { "--pp-radio": "2px" },
  suave: { "--pp-radio": "var(--radius-card)" },
  redonda: { "--pp-radio": "28px" },
};

const DENSIDAD: Record<TokensResueltos["densidad"], Record<string, string>> = {
  compacta: { "--pp-relleno": "1rem", "--pp-relleno-chico": "0.75rem", "--pp-espacio": "1rem", "--pp-espacio-pagina": "1.75rem" },
  comoda: { "--pp-relleno": "1.5rem", "--pp-relleno-chico": "1rem", "--pp-espacio": "1.5rem", "--pp-espacio-pagina": "2.5rem" },
  amplia: { "--pp-relleno": "2rem", "--pp-relleno-chico": "1.25rem", "--pp-espacio": "2rem", "--pp-espacio-pagina": "3.5rem" },
};

const SUPERFICIE: Record<TokensResueltos["superficie"], Record<string, string>> = {
  plana: { "--pp-borde-ancho": "0px", "--pp-sombra": "0 0 #0000" },
  borde: { "--pp-borde-ancho": "0.5px", "--pp-sombra": "0 0 #0000" },
  elevada: { "--pp-borde-ancho": "0px", "--pp-sombra": "var(--shadow-soft)" },
  // Sin tarjeta: el contenido va directo sobre el fondo de la página. El
  // relleno lateral se va (no hay caja que lo justifique); queda un poco de
  // aire arriba y abajo.
  "sin-tarjeta": {
    "--pp-superficie": "transparent",
    "--pp-borde-ancho": "0px",
    "--pp-sombra": "0 0 #0000",
    "--pp-relleno-tarjeta": "0.5rem 0",
  },
};

// Fondos de página: CSS puro, con los colores del tema (nunca un color
// propio). La textura es un patrón de puntos con radial-gradient — el plan
// hablaba de "SVG propios, inline", pero un data URI de SVG no puede leer
// custom properties, así que no podría tomar el acento del tema.
const FONDO: Record<TokensResueltos["fondo"], Record<string, string>> = {
  liso: {},
  degrade: {
    "--pp-fondo-imagen": "linear-gradient(180deg, color-mix(in srgb, var(--pp-acento) 14%, var(--pp-fondo)) 0%, var(--pp-fondo) 60%)",
  },
  textura: {
    "--pp-fondo-imagen": "radial-gradient(color-mix(in srgb, var(--pp-acento) 22%, transparent) 1px, transparent 1.2px)",
    "--pp-fondo-tamano": "18px 18px",
  },
};

const BOTON: Record<TokensResueltos["boton"], Record<string, string>> = {
  pastilla: { "--pp-boton-radio": "9999px" },
  redondeado: { "--pp-boton-radio": "var(--radius-field)" },
  recto: { "--pp-boton-radio": "2px" },
};

const SIN_TEMA: Omit<EstiloDeTema, "tokens"> = { activo: false, className: "", style: {} };

/** Los tokens que rigen SIN tema: ninguno de estilo, solo la portada elegida. */
function tokensSinTema(elegidos: unknown): TokensResueltos {
  const portada = tokensDeConfig(elegidos).portada;
  return { ...TOKENS_POR_DEFECTO, ...(portada ? { portada } : {}) };
}

// Custom properties de la plantilla (prefijo --pp-, "página pública"). Las
// nuevas de PE-2 tienen su default en `.pp-raiz`; las de color de la 4.5
// (--pp-fondo, --pp-acento*) la plantilla las lee con un fallback propio, así
// que sin tema simplemente no están definidas.
export function estiloDeTema(tema: string, variante: string, tipografia: string, tokensElegidos: TokensTema | unknown = {}): EstiloDeTema {
  const paleta = paletaPorId(tema);
  if (!paleta) return { ...SIN_TEMA, tokens: tokensSinTema(tokensElegidos) };

  // Una variante o tipografía que no corresponde al tema (dato viejo, o un
  // catálogo que cambió) cae a la primera del tema en vez de romper la
  // página: lo que llega de la base es un string, no un tipo.
  const v = variantePorId(paleta, variante) ?? paleta.variantes[0];
  const colores = derivarColorDeVariante(paleta, v);
  const ofrecidas = TIPOGRAFIAS_POR_TEMA[paleta.id] ?? [TIPOGRAFIAS_PAGINA_PUBLICA[0].id];
  const tipo = tipografiaPorId(tipografia) ?? tipografiaPorId(ofrecidas[0]) ?? TIPOGRAFIAS_PAGINA_PUBLICA[0];
  const tokens = resolverTokens(paleta.tokens, tokensElegidos);

  // Lo que va ENCIMA del acento (el texto del botón relleno, el de una
  // sección "contraste"): claro sobre un acento oscurecido, y el fondo del
  // tema sobre un acento aclarado (tema oscuro).
  const sobreAcento = paleta.oscuro ? paleta.fondoBase : "var(--color-marfil)";
  const contorno = tokens.botonEstilo === "contorno";

  return {
    activo: true,
    className: tipo.claseVariables,
    tokens,
    style: {
      "--pp-fondo": paleta.fondoBase,
      "--pp-acento": colores.acento,
      "--pp-acento-suave": colores.fondo,
      "--pp-acento-texto": colores.texto,
      ...(paleta.superficie ? { "--pp-superficie": paleta.superficie } : {}),
      ...(paleta.texto ? { "--pp-texto": paleta.texto } : {}),
      ...(paleta.borde ? { "--pp-borde": paleta.borde } : {}),
      "--pp-contraste-texto": sobreAcento,
      ...FORMA[tokens.forma],
      ...DENSIDAD[tokens.densidad],
      ...SUPERFICIE[tokens.superficie],
      ...FONDO[tokens.fondo],
      ...BOTON[tokens.boton],
      "--pp-boton-fondo": contorno ? "transparent" : colores.texto,
      "--pp-boton-texto": contorno ? colores.texto : sobreAcento,
      "--pp-boton-borde": colores.texto,
      "--pp-boton-borde-ancho": contorno ? "1.5px" : "0px",
      // Pisar --font-display/--font-body en ESTE subárbol es lo que hace
      // que los títulos (que ya usan var(--font-display)) tomen la
      // tipografía del tema sin tocar cada uno.
      "--font-display": `var(${tipo.displayVar}), Georgia, serif`,
      "--font-body": `var(${tipo.bodyVar}), -apple-system, "Segoe UI", sans-serif`,
      fontFamily: "var(--font-body)",
    } as CSSProperties,
  };
}
