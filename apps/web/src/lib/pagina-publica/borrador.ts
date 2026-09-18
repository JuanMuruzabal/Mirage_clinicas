// El borrador del editor de página (Fase 4.4): todo lo editable, en una sola
// estructura que vive en el cliente hasta que se aprieta "Guardar cambios".
// El PATCH de /panel/pagina reemplaza el contenido completo, así que el
// borrador tiene la misma forma que lo que se manda — y "hay cambios" es
// comparar dos borradores, no rastrear cada campo tocado.
import type { PaginaPublica } from "@dental-mirage/shared-types";
import type { ActualizarPaginaPublicaPayload } from "@/lib/api";
import type { ContenidoPagina } from "./contenido";
import { borradorDeModulos, modulosAPayload, type ModuloBorrador } from "./modulos";

export interface Borrador {
  bio: string;
  tema: string;
  temaVariante: string;
  temaTipografia: string;
  fotoPortadaUrl: string;
  redes: Record<string, string>;
  mostrarMapa: boolean;
  direccionOverride: string;
  nombreSobrePortada: boolean;
  nombreColor: string;
  modulos: ModuloBorrador[];
}

export function borradorDePagina(p: PaginaPublica): Borrador {
  return {
    bio: p.bio ?? "",
    tema: p.tema,
    temaVariante: p.temaVariante,
    temaTipografia: p.temaTipografia,
    fotoPortadaUrl: p.fotoPortadaUrl ?? "",
    redes: { ...p.redesSociales },
    mostrarMapa: p.mostrarMapa,
    direccionOverride: p.direccionOverride ?? "",
    nombreSobrePortada: p.nombreSobrePortada,
    nombreColor: p.nombreColor,
    modulos: borradorDeModulos(p.modulos),
  };
}

/**
 * El cuerpo del PATCH. Todo se manda siempre (reemplazo completo, mismo
 * criterio que el backend): un campo vacío viaja como "" — que es como se
 * borra algo en un `*string` de Go — y no como una clave ausente, que
 * significaría "no lo toques".
 */
export function borradorAPayload(b: Borrador): ActualizarPaginaPublicaPayload {
  return {
    bio: b.bio.trim(),
    tema: b.tema,
    temaVariante: b.temaVariante,
    temaTipografia: b.temaTipografia,
    fotoPortadaUrl: b.fotoPortadaUrl,
    redesSociales: b.redes,
    mostrarMapa: b.mostrarMapa,
    direccionOverride: b.direccionOverride.trim(),
    nombreSobrePortada: b.nombreSobrePortada,
    nombreColor: b.nombreColor,
    modulos: modulosAPayload(b.modulos),
  };
}

// Compara por valor (JSON) y no por referencia: el editor reconstruye
// objetos en cada cambio, y deshacer a mano un cambio tiene que apagar el
// aviso de "sin guardar". Las `clave` de los módulos se excluyen a propósito
// — son identidad del cliente, no contenido.
function firma(b: Borrador): string {
  return JSON.stringify({ ...b, modulos: b.modulos.map((m) => ({ tipo: m.tipo, visible: m.visible, config: m.config })) });
}

export function hayCambios(a: Borrador, b: Borrador): boolean {
  return firma(a) !== firma(b);
}

/** Lo que dibuja la vista previa: el borrador, tal como lo vería un visitante. */
export function contenidoDeBorrador(b: Borrador, pagina: Pick<PaginaPublica, "estadisticas" | "direccionClinica">): ContenidoPagina {
  return {
    bio: b.bio,
    tema: b.tema,
    temaVariante: b.temaVariante,
    temaTipografia: b.temaTipografia,
    fotoPortadaUrl: b.fotoPortadaUrl || null,
    redesSociales: b.redes,
    mostrarMapa: b.mostrarMapa,
    // Mismo criterio que direccionEfectiva() del backend: gana el override.
    direccion: b.direccionOverride.trim() || pagina.direccionClinica || null,
    nombreSobrePortada: b.nombreSobrePortada,
    nombreColor: b.nombreColor,
    modulos: b.modulos.filter((m) => m.visible),
    estadisticas: pagina.estadisticas,
  };
}
