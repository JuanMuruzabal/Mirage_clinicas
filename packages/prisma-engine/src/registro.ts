import { sobreNosotros } from "./modulos/sobre-nosotros/meta";
import { textoLibre } from "./modulos/texto-libre/meta";
import { especialidadesModulo } from "./modulos/especialidades/meta";
import { fotoModulo } from "./modulos/foto/meta";
import { galeriaModulo } from "./modulos/galeria/meta";
import { estadisticasModulo } from "./modulos/estadisticas/meta";
import { contactoModulo } from "./modulos/contacto/meta";
import { ALINEACIONES, FONDOS_SECCION } from "./seccion";
import type { ContextoPublico, DefinicionModulo, ModuloBorrador, SeccionPublica, TipoModulo } from "./tipos";

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

/**
 * La sección pública de UN módulo, con sus opciones de sección (PE-3) ya
 * leídas de la config — el único camino por el que la plantilla arma una
 * sección. Un render nunca mira `fondoSeccion`/`alineacion`: los aplica la
 * plantilla sobre el <section>, y solo si el módulo los admite (una config
 * con `fondoSeccion` en un módulo que no lo ofrece se ignora, no se dibuja).
 */
export function seccionPublicaDe(modulo: ModuloBorrador, indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const definicion = definicionDeModulo(modulo.tipo);
  if (!definicion) return null;
  const seccion = definicion.seccion(modulo, indice, contexto);
  if (!seccion) return null;
  const { fondo, alineacion } = definicion.opcionesDeSeccion;
  const fondoElegido = modulo.config.fondoSeccion;
  const alineacionElegida = modulo.config.alineacion;
  return {
    ...seccion,
    fondo: fondo && FONDOS_SECCION.includes(fondoElegido as never) ? (fondoElegido as SeccionPublica["fondo"]) : undefined,
    alineacion: alineacion && ALINEACIONES.includes(alineacionElegida as never) ? (alineacionElegida as SeccionPublica["alineacion"]) : undefined,
  };
}
