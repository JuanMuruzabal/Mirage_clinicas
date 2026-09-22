import { seccionPublicaDe, type ModuloBorrador, type SeccionPublica, type UtilsRender } from "@dental-mirage/prisma-engine";
import type { ContenidoPagina } from "@/lib/pagina-publica/contenido";
import { esUrlDeFotoSegura, hrefDeTelefono, urlDeComoLlegar, urlDeMapaEmbebido, urlDeRedSocial } from "@/lib/pagina-publica/enlaces";

export type { SeccionPublica };

// Los módulos opcionales de la página pública (Fase 4.5, PE-1). Cada uno
// devuelve `null` cuando no tiene nada que mostrar — un "Sobre nosotros"
// sin texto o una galería sin fotos no dejan un hueco ni un título suelto,
// y tampoco un link en el menú de la página (el menú sale de lo que SÍ se
// dibujó, ver ClinicaPublicaTemplate).
//
// El render de cada módulo vive en @dental-mirage/prisma-engine — este
// archivo es el lookup (sin `switch`) y el puente hacia lo que ese paquete
// no conoce: enlaces.ts (TR-154, construye hrefs seguros) se inyecta como
// `utils` para que el paquete no dependa de apps/web.

interface Contexto {
  nombreClinica: string;
  telefono?: string | null;
  especialidades: string[];
  contenido: ContenidoPagina;
}

const UTILS: UtilsRender = { esUrlDeFotoSegura, hrefDeTelefono, urlDeComoLlegar, urlDeMapaEmbebido, urlDeRedSocial };

/**
 * Arma la sección pública de UN módulo, o `null` si no hay nada que
 * mostrar. `indice` es la posición dentro de la lista (para dar ancla propia
 * a los módulos que pueden repetirse). Un tipo que este frontend no conoce
 * (p. ej. "horarios", que el backend acepta pero todavía no se dibuja) se
 * ignora en vez de romper la página.
 */
export function seccionDeModulo(modulo: ModuloBorrador, indice: number, contexto: Contexto): SeccionPublica | null {
  // seccionPublicaDe (PE-3) suma las opciones de sección (fondo, alineación)
  // que la plantilla aplica sobre el <section>.
  return seccionPublicaDe(modulo, indice, { ...contexto, utils: UTILS });
}
