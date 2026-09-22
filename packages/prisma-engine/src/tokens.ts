// Tokens de diseño de la página (PE-2): lo que hace que un tema sea más que
// color y tipografía. Cada token es un id de un conjunto CERRADO de opciones
// curadas — nunca un número, un hex ni un radio libre ("editor de
// configuración, no lienzo en blanco", decisión congelada del plan).
//
// Se guardan en `paginas_publicas.tema_tokens` (jsonb) como OVERRIDES: un
// token ausente vale lo que trae el tema elegido (`tokens` de su paleta, en
// apps/web/src/lib/temas-pagina-publica/paletas.ts), y un tema sin `tokens`
// vale TOKENS_POR_DEFECTO — que es exactamente el aspecto de la página antes
// de PE-2, para que ninguna página existente cambie sola.
//
// `portada` no es un token de estilo sino la variante de layout de la
// portada (PE-3): vive acá porque es de la página y no de un módulo (la
// portada es estructural, nunca se persiste como módulo), y así no hace falta
// una columna aparte. A diferencia del resto, rige también SIN tema elegido.
export const OPCIONES_TOKENS = {
  forma: ["recta", "suave", "redonda"],
  densidad: ["compacta", "comoda", "amplia"],
  superficie: ["plana", "borde", "elevada", "sin-tarjeta"],
  fondo: ["liso", "degrade", "textura"],
  boton: ["pastilla", "redondeado", "recto"],
  botonEstilo: ["relleno", "contorno"],
  menu: ["pastillas", "subrayado", "barra"],
  portada: ["centrada", "dividida", "fondo", "minima"],
} as const;

export type ClaveToken = keyof typeof OPCIONES_TOKENS;
export type TokensTema = { [K in ClaveToken]?: (typeof OPCIONES_TOKENS)[K][number] };
export type TokensResueltos = Required<TokensTema>;

/** El aspecto de la página ANTES de PE-2. No cambiar sin querer: mueve todas las páginas con tema. */
export const TOKENS_POR_DEFECTO: TokensResueltos = {
  forma: "suave",
  densidad: "comoda",
  superficie: "borde",
  fondo: "liso",
  boton: "pastilla",
  botonEstilo: "relleno",
  menu: "pastillas",
  portada: "centrada",
};

/**
 * Lectura tolerante (mismo criterio que lectura-config.ts): lo que llega de
 * la base es jsonb, no un tipo. Un valor que no está en el catálogo (un
 * token que se sacó, un dato viejo) se ignora y cae al del tema, nunca rompe
 * la página.
 */
export function tokensDeConfig(valor: unknown): TokensTema {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const fuente = valor as Record<string, unknown>;
  const limpios: Record<string, string> = {};
  for (const clave of Object.keys(OPCIONES_TOKENS) as ClaveToken[]) {
    const v = fuente[clave];
    if (typeof v === "string" && (OPCIONES_TOKENS[clave] as readonly string[]).includes(v)) limpios[clave] = v;
  }
  return limpios as TokensTema;
}

/** Defaults globales ← defaults del tema ← lo que eligió el admin. */
export function resolverTokens(delTema: TokensTema | undefined, elegidos: unknown): TokensResueltos {
  return { ...TOKENS_POR_DEFECTO, ...(delTema ?? {}), ...tokensDeConfig(elegidos) };
}

// Textos del editor (pestaña "Diseño"). Un Record completo por clave: si se
// suma una opción arriba y no se la nombra acá, el typecheck falla.
export const ETIQUETAS_TOKENS: { [K in ClaveToken]: { titulo: string; opciones: Record<(typeof OPCIONES_TOKENS)[K][number], string> } } = {
  forma: { titulo: "Forma", opciones: { recta: "Recta", suave: "Suave", redonda: "Redonda" } },
  densidad: { titulo: "Espaciado", opciones: { compacta: "Compacto", comoda: "Cómodo", amplia: "Amplio" } },
  superficie: {
    titulo: "Tarjetas",
    opciones: { plana: "Planas", borde: "Con borde", elevada: "Elevadas", "sin-tarjeta": "Sin tarjeta" },
  },
  fondo: { titulo: "Fondo de la página", opciones: { liso: "Liso", degrade: "Degradé suave", textura: "Textura sutil" } },
  boton: { titulo: "Botón de turno", opciones: { pastilla: "Pastilla", redondeado: "Redondeado", recto: "Recto" } },
  botonEstilo: { titulo: "Relleno del botón", opciones: { relleno: "Relleno", contorno: "Contorno" } },
  menu: { titulo: "Menú", opciones: { pastillas: "Pastillas", subrayado: "Subrayado", barra: "Barra fija arriba" } },
  portada: {
    titulo: "Portada",
    opciones: { centrada: "Centrada", dividida: "Dividida", fondo: "Foto de fondo", minima: "Mínima" },
  },
};
