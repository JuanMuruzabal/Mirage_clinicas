// Módulos de la página pública (Fase 4.4/4.5, docs/Fases post MVP/Fase 4/
// fase4-personalizar-pagina.md) — la lógica pura que comparten el EDITOR
// (que arma y guarda la lista) y la PLANTILLA (que la renderiza), para que
// nunca describan dos páginas distintas.
//
// PE-1 (docs/Fases post MVP/Prisma Engine/plan-prisma-engine.md): el
// catálogo de módulos (config inicial, ancho, formulario, render) vive en
// @dental-mirage/prisma-engine — este archivo queda como fachada para no
// tocar cada import existente, más las funciones de PÁGINA (mover, filtrar,
// armar el payload) que no son de un módulo puntual.
//
// "portada" y "turno" son estructurales, van siempre primero y la plantilla los dibuja directo.
// Todos los módulos editables se resuelven en el registro único de Prisma Engine.
import {
  CATALOGO_PRESETS_SECCION,
  DEFINICIONES_MODULOS,
  ESTADISTICAS,
  MAX_LARGO_BIO,
  MAX_LARGO_NOMBRE_MODULO,
  MAX_LARGO_RED,
  MAX_LARGO_TEXTO_LIBRE,
  MAX_LARGO_TITULO_TEXTO,
  REDES_SOCIALES,
  SUBTIPOS_FOTO,
  TOPE_FOTOS_GALERIA,
  TOPE_FOTOS_SUELTAS,
  definicionDeModulo,
  listaDeConfig,
  moduloDePresetSeccion,
  subtipoDeConfig,
  textoDeConfig,
  type CamposDePagina,
  type ComponentesInyectados,
  type ContextoPublico,
  type DefinicionModulo,
  type EditorModuloProps,
  type EquipoElegible,
  type EstadisticaId,
  type HorariosClinica,
  type ModuloBorrador,
  type PropsSubirFoto,
  type RedSocial,
  type SeccionPublica,
  type ServicioVista,
  type SubtipoFoto,
  type TipoModulo,
  type UtilsRender,
} from "@dental-mirage/prisma-engine";
import type { PaginaPublicaModulo } from "@dental-mirage/shared-types";
import type { PaginaPublicaModuloPayload } from "@/lib/api";

export type {
  CamposDePagina,
  ComponentesInyectados,
  ContextoPublico,
  DefinicionModulo,
  EditorModuloProps,
  EquipoElegible,
  EstadisticaId,
  HorariosClinica,
  ModuloBorrador,
  PropsSubirFoto,
  RedSocial,
  SeccionPublica,
  ServicioVista,
  SubtipoFoto,
  TipoModulo,
  UtilsRender,
};
export {
  DEFINICIONES_MODULOS,
  CATALOGO_PRESETS_SECCION,
  ESTADISTICAS,
  MAX_LARGO_BIO,
  MAX_LARGO_NOMBRE_MODULO,
  MAX_LARGO_RED,
  MAX_LARGO_TEXTO_LIBRE,
  MAX_LARGO_TITULO_TEXTO,
  REDES_SOCIALES,
  SUBTIPOS_FOTO,
  TOPE_FOTOS_GALERIA,
  TOPE_FOTOS_SUELTAS,
  definicionDeModulo,
  listaDeConfig,
  moduloDePresetSeccion,
  subtipoDeConfig,
  textoDeConfig,
};

export function configInicial(tipo: string): Record<string, unknown> {
  return definicionDeModulo(tipo)?.configInicial() ?? {};
}

let contadorDeClaves = 0;
/** Clave única para un módulo que nace en el cliente (no toca el servidor). */
export function nuevaClave(): string {
  contadorDeClaves += 1;
  return `nuevo-${contadorDeClaves}`;
}

/**
 * Lo que tiene una página que nadie personalizó todavía: la estructura que
 * la plantilla fija ya mostraba (Sobre nosotros + Especialidades). Es UNA
 * función y no dos listas —una en el editor, otra en la plantilla— porque
 * si difirieran, lo que el admin ve editando no sería lo que ve el público.
 */
export function modulosPorDefecto(): ModuloBorrador[] {
  return [
    { clave: "defecto-sobre_nosotros", tipo: "sobre_nosotros", visible: true, config: {} },
    { clave: "defecto-especialidades", tipo: "especialidades", visible: true, config: {} },
  ];
}

/**
 * Del servidor al editor. Una lista vacía es "nunca la personalizaron" y
 * arranca con la estructura por defecto. Por eso el editor no deja quitar
 * el último módulo (ocultarlo sí): si pudiera guardar CERO, al recargar
 * reaparecería la estructura por defecto y el admin creería que su borrado
 * no se guardó.
 */
export function borradorDeModulos(modulos: PaginaPublicaModulo[]): ModuloBorrador[] {
  if (modulos.length === 0) return modulosPorDefecto();
  return [...modulos]
    .sort((a, b) => a.orden - b.orden)
    .map((m) => ({ clave: m.id ?? `${m.tipo}-${m.orden}`, tipo: m.tipo, visible: m.visible, config: m.config ?? {}, datosVista: m.datosVista }));
}

/**
 * Del editor al PATCH: el orden es la posición en la lista. El nombre propio
 * se guarda recortado (y se quita si quedó en blanco): el campo del editor
 * conserva lo tipeado tal cual, espacios incluidos, para poder escribir
 * "Sala de espera".
 */
export function modulosAPayload(modulos: ModuloBorrador[]): PaginaPublicaModuloPayload[] {
  return modulos.map((m, i) => {
    const nombre = nombrePropioDeModulo(m.config);
    const config = "nombre" in m.config ? conNombrePropio(m.config, nombre) : m.config;
    return { tipo: m.tipo, orden: i, visible: m.visible, config };
  });
}

/**
 * Los módulos que ve el público. El endpoint público ya devuelve solo los
 * visibles y ordenados; lo único que resuelve esto es "vacío": sin
 * `personalizada` es una página que nadie tocó (estructura por defecto), con
 * `personalizada` es una que ocultó todo a propósito (solo portada y turno).
 */
export function modulosParaMostrar(pagina: { modulos: PaginaPublicaModulo[]; personalizada?: boolean }): ModuloBorrador[] {
  if (pagina.modulos.length === 0) {
    return pagina.personalizada ? [] : modulosPorDefecto();
  }
  return borradorDeModulos(pagina.modulos).filter((m) => m.visible);
}

/** Mueve un elemento de `desde` a `hasta` sin mutar la lista. */
export function moverModulo<T>(lista: T[], desde: number, hasta: number): T[] {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return lista;
  const copia = [...lista];
  const [movido] = copia.splice(desde, 1);
  copia.splice(hasta, 0, movido);
  return copia;
}

export function cantidadDeFotosSueltas(modulos: ModuloBorrador[]): number {
  return modulos.filter((m) => m.tipo === "foto").length;
}

/** ¿Se puede sumar otro módulo de este tipo? Los únicos, una vez; las fotos, con tope. */
export function puedeAgregar(modulos: ModuloBorrador[], tipo: string): boolean {
  const def = definicionDeModulo(tipo);
  if (!def) return false;
  if (!def.repetible) return !modulos.some((m) => m.tipo === tipo);
  if (tipo === "foto") return cantidadDeFotosSueltas(modulos) < TOPE_FOTOS_SUELTAS;
  return true;
}

/**
 * Cuánto de la grilla ocupa un módulo. Portada y turno siempre van a ancho
 * completo (los dibuja la plantilla aparte); acá solo se decide para los
 * opcionales: en pantallas angostas todo es una columna, desde tablet la
 * grilla tiene dos y estos son los que ocupan una sola.
 */
export function anchoDeModulo(tipo: string, config: Record<string, unknown>): "completo" | "medio" {
  return definicionDeModulo(tipo)?.ancho(config) ?? "completo";
}

// --- Nombre propio de un módulo ------------------------------------------

/**
 * El nombre que el admin le puso a un módulo para reconocerlo en el editor
 * ("Foto de la sala de espera"), o "" si no le puso ninguno. Vive en
 * `config.nombre` de cualquier tipo — no hace falta una columna — y es SOLO
 * del editor: no cambia los títulos que ve el público.
 */
export function nombrePropioDeModulo(config: Record<string, unknown>): string {
  return textoDeConfig(config, "nombre").trim();
}

/** La config con el nombre puesto; un nombre vacío QUITA la clave (no deja `{nombre: ""}` ensuciando el guardado). */
export function conNombrePropio(config: Record<string, unknown>, nombre: string): Record<string, unknown> {
  const copia = { ...config };
  if (nombre.trim() === "") delete copia.nombre;
  else copia.nombre = nombre;
  return copia;
}
