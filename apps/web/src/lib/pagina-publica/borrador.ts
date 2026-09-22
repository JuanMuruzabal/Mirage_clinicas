// El borrador del editor de página (Fase 4.4): todo lo editable, en una sola
// estructura que vive en el cliente hasta que se aprieta "Guardar cambios".
// El PATCH de /panel/pagina reemplaza el contenido completo, así que el
// borrador tiene la misma forma que lo que se manda — y "hay cambios" es
// comparar dos borradores, no rastrear cada campo tocado.
import type { ContenidoVersionPaginaPublica, PaginaPublica } from "@dental-mirage/shared-types";
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
  /** PE-8: el candado optimista — lo que el servidor tenía guardado cuando se leyó/guardó este borrador. */
  revision: number;
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
    revision: p.revision,
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
    revision: b.revision,
  };
}

// Compara por valor (JSON) y no por referencia: el editor reconstruye
// objetos en cada cambio, y deshacer a mano un cambio tiene que apagar el
// aviso de "sin guardar". Las `clave` de los módulos y la `revision` se
// excluyen a propósito — son identidad del cliente/candado optimista, no
// contenido: dos borradores con el mismo texto pero distinta revision (uno
// recién releído del servidor) no son "un cambio sin guardar".
function firmaDeContenido(b: Borrador): string {
  // Desestructurar para sacar `revision` de `contenido` — un `Pick`/`Omit`
  // en la firma del parámetro NO alcanza: son un recorte de TIPO, no de
  // VALOR, así que un `{ ...b }` de un Borrador real sigue trayendo
  // `revision` puesta igual, y dos borradores con el mismo contenido pero
  // distinta revision (uno recién releído del servidor) nunca daban la
  // misma firma (bug real, encontrado por el primer test que ejercitó
  // hayCambiosSinPublicar).
  const { revision: _revision, ...contenido } = b;
  return JSON.stringify({ ...contenido, modulos: contenido.modulos.map((m) => ({ tipo: m.tipo, visible: m.visible, config: m.config })) });
}

export function hayCambios(a: Borrador, b: Borrador): boolean {
  return firmaDeContenido(a) !== firmaDeContenido(b);
}

/**
 * PE-8: "hay cambios sin publicar" — compara el borrador GUARDADO (no el
 * que se está tipeando) contra la última versión publicada. Sin ninguna
 * versión todavía, cualquier borrador guardado cuenta como cambio sin
 * publicar (nunca se publicó nada).
 */
export function hayCambiosSinPublicar(guardado: Borrador, publicado: ContenidoVersionPaginaPublica | undefined): boolean {
  if (!publicado) return true;
  return firmaDeContenido(guardado) !== firmaDeContenidoPublicado(publicado);
}

function firmaDeContenidoPublicado(c: ContenidoVersionPaginaPublica): string {
  return JSON.stringify({
    bio: c.bio ?? "",
    tema: c.tema,
    temaVariante: c.temaVariante,
    temaTipografia: c.temaTipografia,
    fotoPortadaUrl: c.fotoPortadaUrl ?? "",
    redes: c.redesSociales,
    mostrarMapa: c.mostrarMapa,
    direccionOverride: c.direccionOverride ?? "",
    nombreSobrePortada: c.nombreSobrePortada,
    nombreColor: c.nombreColor,
    modulos: c.modulos.map((m) => ({ tipo: m.tipo, visible: m.visible, config: m.config })),
  });
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
