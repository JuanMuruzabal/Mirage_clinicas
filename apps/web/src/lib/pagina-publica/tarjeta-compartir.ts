// La tarjeta que aparece al compartir el link de una clínica (PE-9): colores
// y tipografía del tema, para que el link pasado por WhatsApp se vea como la
// página. La dibuja `app/[slug]/opengraph-image.tsx` con next/og (Satori),
// que no entiende `color-mix()` ni variables CSS: por eso los colores salen
// acá ya resueltos, del mismo catálogo que usa la plantilla.
import { PALETAS_PAGINA_PUBLICA, paletaPorId, variantePorId } from "@/lib/temas-pagina-publica";

export interface ColoresTarjeta {
  fondo: string;
  texto: string;
  acento: string;
  /** El texto que va sobre el acento (el botón "Pedí tu turno"). */
  sobreAcento: string;
}

// Sin tema elegido la página tiene su piel celeste de siempre (el
// `bg-[var(--pp-fondo,#e7f2f7)]` de la plantilla, con el grafito y el salvia
// de Mirage): la tarjeta usa esos mismos colores.
const SIN_TEMA: ColoresTarjeta = { fondo: "#e7f2f7", texto: "#35312b", acento: "#3f5943", sobreAcento: "#fffdf9" };

export function coloresDeTarjeta(tema: string, temaVariante: string): ColoresTarjeta {
  const paleta = paletaPorId(tema);
  if (!paleta) return SIN_TEMA;
  const variante = variantePorId(paleta, temaVariante) ?? paleta.variantes[0];
  return {
    fondo: paleta.fondoBase,
    texto: paleta.texto ?? SIN_TEMA.texto,
    acento: variante.hex,
    // En un tema oscuro el acento es claro: el texto encima va en el fondo.
    sobreAcento: paleta.oscuro ? paleta.fondoBase : "#ffffff",
  };
}

// La familia de Google Fonts del TÍTULO de cada tipografía del catálogo
// (tipografias.ts carga las mismas con next/font, que no sirve fuera de un
// componente: la tarjeta necesita el archivo de la fuente). Sin tipografía
// elegida, la display del sitio (Big Shoulders, layout.tsx).
const FAMILIA_TITULO: Record<string, { familia: string; peso: number }> = {
  "condensada-institucional": { familia: "Big Shoulders", peso: 800 },
  "serif-clasica": { familia: "Fraunces", peso: 600 },
  "geometrica-moderna": { familia: "Space Grotesk", peso: 700 },
  "redondeada-calida": { familia: "Fredoka", peso: 600 },
  "editorial-suave": { familia: "Libre Baskerville", peso: 700 },
};

export function familiaDelTitulo(tipografia: string) {
  return FAMILIA_TITULO[tipografia] ?? FAMILIA_TITULO["condensada-institucional"];
}

/** Los ids de tipografía con familia para la tarjeta — lo usa el test que la compara con el catálogo. */
export const TIPOGRAFIAS_CON_FAMILIA = Object.keys(FAMILIA_TITULO);

/** Todos los temas del catálogo resuelven colores (el test lo recorre). */
export const IDS_DE_TEMAS = PALETAS_PAGINA_PUBLICA.map((p) => p.id);

const fuentes = new Map<string, Promise<ArrayBuffer | null>>();

/**
 * El archivo TTF de la familia, pedido a Google Fonts la primera vez y
 * guardado en memoria del proceso (son cinco familias, un peso cada una).
 * Si Google no responde a tiempo, `null`: la tarjeta sale con la fuente por
 * defecto de next/og en vez de fallar — compartir un link nunca puede
 * depender de un tercero.
 */
export function fuenteDelTitulo(familia: string, peso: number): Promise<ArrayBuffer | null> {
  const clave = `${familia}:${peso}`;
  let pendiente = fuentes.get(clave);
  if (!pendiente) {
    pendiente = descargarFuente(familia, peso).then((datos) => {
      // Un fallo no se memoriza: el próximo pedido lo vuelve a intentar.
      if (!datos) fuentes.delete(clave);
      return datos;
    });
    fuentes.set(clave, pendiente);
  }
  return pendiente;
}

async function descargarFuente(familia: string, peso: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia)}:wght@${peso}`, {
      signal: AbortSignal.timeout(3000),
    }).then((r) => (r.ok ? r.text() : ""));
    // Sin un User-Agent de navegador, Google responde con TTF — el formato
    // que next/og sabe leer (no WOFF2).
    const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const archivo = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return archivo.ok ? await archivo.arrayBuffer() : null;
  } catch {
    return null;
  }
}
