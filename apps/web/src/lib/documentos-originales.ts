// Las páginas de los modelos originales del Colegio, renderizadas como
// imágenes (Fase 5.1, pedido del cliente: "Así es el documento" tiene que
// ser EXACTAMENTE el PDF — misma tipografía, todo). Un calco en HTML nunca
// iba a quedar igual: el modelo usa Tahoma, que no está en Google Fonts y
// es una fuente con licencia de Microsoft. La página renderizada sí es el
// original, píxel por píxel.
//
// Las genera `scripts/renderizar-originales.py` desde los PDF del Colegio
// (que no se versionan): dos anchos por página en public/, y este
// manifiesto con sus medidas. Van por VERSIÓN de plantilla: un documento
// sellado se dibuja sobre la página que se firmó (TR-187).
import manifiesto from "./documentos-originales.json";

export interface PaginaOriginal {
  numero: number;
  src: string;
  srcSet: string;
  /** La de 2550 px: una hoja carta a 300 dpi, para imprimir (TR-188). */
  srcImpresion: string;
  ancho: number;
  alto: number;
}

interface EntradaDelManifiesto {
  archivo: string;
  paginas: { numero: number; ancho: number; alto: number }[];
}

const ORIGINALES = manifiesto as Record<string, EntradaDelManifiesto>;

/** Las páginas del modelo original de una versión de una plantilla;
 *  vacío si todavía no se renderizó. */
export function paginasDelOriginal(plantillaId: string, version: number): PaginaOriginal[] {
  const entrada = ORIGINALES[`${plantillaId}@${version}`];
  if (!entrada) return [];
  const base = `/documentos-clinicos/originales/${plantillaId}/v${version}`;
  return entrada.paginas.map((p) => ({
    numero: p.numero,
    src: `${base}/pagina-${p.numero}.w1600.webp`,
    srcSet: `${base}/pagina-${p.numero}.w800.webp 800w, ${base}/pagina-${p.numero}.w1600.webp 1600w`,
    srcImpresion: `${base}/pagina-${p.numero}.w2550.webp`,
    ancho: p.ancho,
    alto: p.alto,
  }));
}
