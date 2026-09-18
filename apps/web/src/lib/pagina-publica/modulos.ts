// Módulos de la página pública (Fase 4.4/4.5, docs/Fases post MVP/Fase 4/
// fase4-personalizar-pagina.md) — la lógica pura que comparten el EDITOR
// (que arma y guarda la lista) y la PLANTILLA (que la renderiza), para que
// nunca describan dos páginas distintas.
//
// "portada" y "turno" no están acá a propósito: son estructurales, van
// siempre primero y la plantilla los dibuja directo (mismo criterio que el
// backend, ver tiposModuloValidos en internal/http/pagina_publica.go).
// "horarios" tampoco está todavía: el backend lo acepta, pero decidir de
// dónde sale (¿la agenda de cuál de los profesionales?) quedó pendiente —
// ver "Preguntas abiertas" del documento de definición.
import type { PaginaPublicaModulo } from "@dental-mirage/shared-types";
import type { PaginaPublicaModuloPayload } from "@/lib/api";

export type TipoModulo = "sobre_nosotros" | "texto_libre" | "especialidades" | "foto" | "galeria" | "estadisticas" | "contacto";
export type SubtipoFoto = "retrato" | "banner" | "franja";
export type EstadisticaId = "pacientes_atendidos" | "turnos_realizados";
export type RedSocial = "instagram" | "facebook" | "whatsapp";

// Espejo de los topes de internal/http/pagina_publica.go — si se cambian
// allá hay que cambiarlos acá (el backend rechaza lo que se pase, así que
// un desfase se ve como un error al guardar, no como datos rotos).
export const TOPE_FOTOS_GALERIA = 8;
export const TOPE_FOTOS_SUELTAS = 10;
export const MAX_LARGO_BIO = 2000;
export const MAX_LARGO_TITULO_TEXTO = 80;
export const MAX_LARGO_TEXTO_LIBRE = 2000;
export const MAX_LARGO_RED = 100;
export const MAX_LARGO_NOMBRE_MODULO = 60;

export const ESTADISTICAS: { id: EstadisticaId; etiqueta: string; descripcion: string }[] = [
  { id: "pacientes_atendidos", etiqueta: "Pacientes atendidos", descripcion: "Personas con al menos un turno al que asistieron." },
  { id: "turnos_realizados", etiqueta: "Turnos realizados", descripcion: "Turnos marcados como asistidos." },
];

export const REDES_SOCIALES: { id: RedSocial; etiqueta: string; placeholder: string }[] = [
  { id: "instagram", etiqueta: "Instagram", placeholder: "@tuclinica" },
  { id: "facebook", etiqueta: "Facebook", placeholder: "tuclinica" },
  { id: "whatsapp", etiqueta: "WhatsApp", placeholder: "+54 9 351 1234567" },
];

export const SUBTIPOS_FOTO: { id: SubtipoFoto; etiqueta: string; descripcion: string }[] = [
  { id: "banner", etiqueta: "Banner", descripcion: "Horizontal, del ancho de la sección." },
  { id: "retrato", etiqueta: "Retrato", descripcion: "Vertical, más angosta." },
  { id: "franja", etiqueta: "Franja", descripcion: "Muy ancha y baja, de borde a borde." },
];

export interface DefinicionModulo {
  tipo: TipoModulo;
  nombre: string;
  descripcion: string;
  /** Se puede tener más de uno en la misma página. */
  repetible: boolean;
}

export const DEFINICIONES_MODULOS: DefinicionModulo[] = [
  { tipo: "sobre_nosotros", nombre: "Sobre nosotros", descripcion: "Un texto institucional sobre la clínica.", repetible: false },
  { tipo: "texto_libre", nombre: "Texto libre", descripcion: "Una sección de texto con título propio.", repetible: true },
  { tipo: "especialidades", nombre: "Especialidades", descripcion: "Se arma sola con las de los profesionales.", repetible: false },
  { tipo: "foto", nombre: "Foto", descripcion: "Una imagen destacada.", repetible: true },
  { tipo: "galeria", nombre: "Galería", descripcion: "Varias fotos juntas.", repetible: false },
  { tipo: "estadisticas", nombre: "Estadísticas", descripcion: "Números reales de tu clínica.", repetible: false },
  { tipo: "contacto", nombre: "Contacto", descripcion: "Dirección, mapa, teléfono y redes.", repetible: false },
];

export function definicionDeModulo(tipo: string): DefinicionModulo | undefined {
  return DEFINICIONES_MODULOS.find((d) => d.tipo === tipo);
}

/**
 * Un módulo tal como lo maneja el editor. `clave` es SOLO del cliente —
 * identifica la fila en React y en el arrastre —, no viaja al backend: el
 * PATCH reemplaza todos los módulos y los ids los pone la base.
 */
export interface ModuloBorrador {
  clave: string;
  tipo: string;
  visible: boolean;
  config: Record<string, unknown>;
}

export function configInicial(tipo: string): Record<string, unknown> {
  switch (tipo) {
    case "texto_libre":
      return { titulo: "", texto: "" };
    case "foto":
      return { fotoUrl: "", subtipo: "banner" };
    case "galeria":
      return { fotoUrls: [] };
    case "estadisticas":
      return { mostrar: ESTADISTICAS.map((e) => e.id) };
    default:
      return {};
  }
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
    .map((m) => ({ clave: m.id, tipo: m.tipo, visible: m.visible, config: m.config ?? {} }));
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
  if (tipo === "especialidades" || tipo === "estadisticas") return "medio";
  if (tipo === "foto" && config.subtipo === "retrato") return "medio";
  return "completo";
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

// --- Lectura tipada de la config (jsonb sin forma común) -----------------

export function textoDeConfig(config: Record<string, unknown>, clave: string): string {
  const v = config[clave];
  return typeof v === "string" ? v : "";
}

export function listaDeConfig(config: Record<string, unknown>, clave: string): string[] {
  const v = config[clave];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function subtipoDeConfig(config: Record<string, unknown>): SubtipoFoto {
  const v = config.subtipo;
  return v === "retrato" || v === "franja" ? v : "banner";
}
