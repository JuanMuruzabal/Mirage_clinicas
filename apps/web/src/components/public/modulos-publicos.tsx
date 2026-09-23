import { seccionPublicaDe, type EstiloMovimiento, type ModuloBorrador, type SeccionPublica, type UtilsRender } from "@dental-mirage/prisma-engine";
import type { ContenidoPagina } from "@/lib/pagina-publica/contenido";
import { esUrlDeFotoSegura, hrefDeTelefono, urlDeComoLlegar, urlDeMapaEmbebido, urlDeRedSocial } from "@/lib/pagina-publica/enlaces";
import { EstadoHorarioActual } from "./estado-horario-actual";

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
  slug: string;
  nombreClinica: string;
  telefono?: string | null;
  especialidades: string[];
  contenido: ContenidoPagina;
  estiloMovimiento?: EstiloMovimiento;
}

const UTILS: UtilsRender = {
  esUrlDeFotoSegura,
  hrefDeTelefono,
  urlDeComoLlegar,
  urlDeMapaEmbebido,
  urlDeRedSocial,
  estadoHorario: (horarios) => <EstadoHorarioActual horarios={horarios} />,
};

/**
 * Arma la sección pública de un módulo, o `null` cuando no tiene contenido.
 * `indice` define el ancla de las instancias repetibles. Los tipos no
 * registrados se ignoran para que una configuración nueva no rompa la página.
 */
export function seccionDeModulo(modulo: ModuloBorrador, indice: number, contexto: Contexto): SeccionPublica | null {
  // seccionPublicaDe (PE-3) suma las opciones de sección (fondo, alineación)
  // que la plantilla aplica sobre el <section>.
  return seccionPublicaDe(modulo, indice, {
    ...contexto,
    utils: {
      ...UTILS,
      hrefPedirTurnoConTipo: (nombre) => `/${contexto.slug}?tipo=${encodeURIComponent(nombre)}#turno`,
    },
  });
}
