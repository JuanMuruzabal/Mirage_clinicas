import { sobreNosotros } from "./modulos/sobre-nosotros/meta";
import { textoLibre } from "./modulos/texto-libre/meta";
import { especialidadesModulo } from "./modulos/especialidades/meta";
import { fotoModulo } from "./modulos/foto/meta";
import { galeriaModulo } from "./modulos/galeria/meta";
import { estadisticasModulo } from "./modulos/estadisticas/meta";
import { contactoModulo } from "./modulos/contacto/meta";
import type { DefinicionModulo, TipoModulo } from "./tipos";

/**
 * El ÚNICO lugar que lista los módulos (PE-1). `editor-de-modulo.tsx` y
 * `modulos-publicos.tsx` (apps/web) pasan a ser un lookup acá, sin `switch`.
 * El orden del objeto es el orden en que aparecen para agregar en el editor
 * (JS conserva el orden de inserción de claves string) — no reordenar sin
 * querer.
 */
export const REGISTRO_MODULOS: Record<TipoModulo, DefinicionModulo> = {
  sobre_nosotros: sobreNosotros,
  texto_libre: textoLibre,
  especialidades: especialidadesModulo,
  foto: fotoModulo,
  galeria: galeriaModulo,
  estadisticas: estadisticasModulo,
  contacto: contactoModulo,
};

export const DEFINICIONES_MODULOS: DefinicionModulo[] = Object.values(REGISTRO_MODULOS);

export function definicionDeModulo(tipo: string): DefinicionModulo | undefined {
  return REGISTRO_MODULOS[tipo as TipoModulo];
}
