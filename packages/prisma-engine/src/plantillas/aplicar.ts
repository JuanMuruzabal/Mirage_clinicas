import type { TokensTema } from "../tokens";
import type { ModuloPlantilla, PlantillaPagina, TextoEjemplo } from "./catalogo";
import type { PresetEstilo, PresetSeccion } from "./presets";

/** Forma mínima del estado editable que necesita el aplicador de plantillas. */
export interface ModuloAplicablePlantilla extends ModuloPlantilla {
  /** Identidad local del editor; no forma parte del JSON de la plantilla. */
  clave?: string;
  datosVista?: unknown;
}

export interface EstadoAplicablePlantilla {
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
  temaTokens: TokensTema;
  modulos: ModuloAplicablePlantilla[];
}

export type ModoAplicacionPlantilla = "diseno" | "reemplazar";

const CAMPOS_DE_DISENO_MODULO = ["variante", "fondoSeccion", "alineacion", "efectos"] as const;

function copiarConfig(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

function tokensCompletos(plantilla: PlantillaPagina): TokensTema {
  return { ...plantilla.temaTokens, movimiento: plantilla.estiloMovimiento };
}

function nuevaClave(plantilla: PlantillaPagina, indice: number, ocupadas: Set<string>): string {
  const base = `plantilla-${plantilla.id}-${indice + 1}`;
  let candidata = base;
  let sufijo = 2;
  while (ocupadas.has(candidata)) {
    candidata = `${base}-${sufijo}`;
    sufijo += 1;
  }
  ocupadas.add(candidata);
  return candidata;
}

function claveDe(modulo: ModuloAplicablePlantilla): string | undefined {
  return typeof modulo.clave === "string" ? modulo.clave : undefined;
}

function clonarModulosDePlantilla(plantilla: PlantillaPagina, existentes: readonly ModuloAplicablePlantilla[] = []): ModuloAplicablePlantilla[] {
  const claves = new Set(existentes.map(claveDe).filter((clave): clave is string => Boolean(clave)));
  return plantilla.modulos.map((modulo, indice) => ({
    ...modulo,
    clave: nuevaClave(plantilla, indice, claves),
    config: copiarConfig(modulo.config),
  }));
}

function configDeDiseno(
  actual: Record<string, unknown>,
  plantilla: Record<string, unknown>,
): Record<string, unknown> {
  const siguiente = { ...actual };
  for (const campo of CAMPOS_DE_DISENO_MODULO) {
    if (Object.prototype.hasOwnProperty.call(plantilla, campo)) {
      siguiente[campo] = JSON.parse(JSON.stringify(plantilla[campo])) as unknown;
    } else {
      delete siguiente[campo];
    }
  }
  return siguiente;
}

function fusionarModulosPorDiseno(
  actuales: readonly ModuloAplicablePlantilla[],
  plantilla: PlantillaPagina,
): ModuloAplicablePlantilla[] {
  const porTipo = new Map<string, ModuloAplicablePlantilla[]>();
  for (const modulo of actuales) {
    const grupo = porTipo.get(modulo.tipo) ?? [];
    grupo.push(modulo);
    porTipo.set(modulo.tipo, grupo);
  }

  const ocurrencias = new Map<string, number>();
  const usados = new Set<ModuloAplicablePlantilla>();
  const claves = new Set(actuales.map(claveDe).filter((clave): clave is string => Boolean(clave)));
  const aplicados = plantilla.modulos.map((deseado, indice): ModuloAplicablePlantilla => {
    const ocurrencia = ocurrencias.get(deseado.tipo) ?? 0;
    ocurrencias.set(deseado.tipo, ocurrencia + 1);
    const actual = porTipo.get(deseado.tipo)?.[ocurrencia];
    if (!actual) {
      return {
        ...deseado,
        clave: nuevaClave(plantilla, indice, claves),
        config: copiarConfig(deseado.config),
      };
    }

    usados.add(actual);
    return {
      ...actual,
      config: configDeDiseno(actual.config, deseado.config),
    };
  });

  // Módulos que la plantilla no trae conservan ubicación, contenido y clave.
  // Los existentes del mismo tipo que no tengan pareja también se preservan.
  return [...aplicados, ...actuales.filter((modulo) => !usados.has(modulo) && !aplicados.some((aplicado) => aplicado === modulo))];
}

/**
 * Aplica el tema y los estilos de sección. En modo `diseno` mantiene los
 * textos, fotos, selecciones y visibilidad actuales; suma secciones ausentes
 * con el contenido de ejemplo de la plantilla. En modo `reemplazar` usa todo
 * su contenido inicial y deja vacíos los datos propios de la clínica.
 */
export function aplicarPlantilla<T extends EstadoAplicablePlantilla>(
  estado: T,
  plantilla: PlantillaPagina,
  modo: ModoAplicacionPlantilla,
): T {
  const diseno = {
    tema: plantilla.tema,
    temaVariante: plantilla.temaVariante,
    temaTipografia: plantilla.temaTipografia,
    temaTokens: tokensCompletos(plantilla),
  };

  if (modo === "diseno") {
    return {
      ...estado,
      ...diseno,
      modulos: fusionarModulosPorDiseno(estado.modulos, plantilla),
    } as T;
  }

  return {
    ...estado,
    ...diseno,
    bio: plantilla.bio,
    fotoPortadaUrl: plantilla.fotoPortadaUrl,
    redes: { ...plantilla.redes },
    mostrarMapa: plantilla.mostrarMapa,
    direccionOverride: plantilla.direccionOverride,
    nombreSobrePortada: plantilla.nombreSobrePortada,
    nombreColor: plantilla.nombreColor,
    modulos: clonarModulosDePlantilla(plantilla, estado.modulos),
  } as T;
}

/** Aplica solo el preset visual global, sin tocar módulos ni contenido. */
export function aplicarPresetEstilo<T extends EstadoAplicablePlantilla>(estado: T, preset: PresetEstilo): T {
  return {
    ...estado,
    tema: preset.tema,
    temaVariante: preset.temaVariante,
    temaTipografia: preset.temaTipografia,
    temaTokens: { ...preset.temaTokens, movimiento: preset.estiloMovimiento },
  } as T;
}

/** Convierte una sección de catálogo a módulo de borrador con clave del editor. */
export function moduloDePresetSeccion(preset: PresetSeccion, clave: string): ModuloAplicablePlantilla {
  return {
    ...preset.modulo,
    clave,
    config: copiarConfig(preset.modulo.config),
  };
}

const RUTA_MODULO = /^modulos\.([a-z0-9_]+)(?:\[(\d+)\])?\.config\.(.+)$/;
const TOKEN_RUTA = /(?:^|\.)([^.[\]]+)|\[(\d+)\]/g;

function pasosDeRuta(ruta: string): Array<string | number> {
  const pasos: Array<string | number> = [];
  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = TOKEN_RUTA.exec(ruta)) !== null) {
    pasos.push(coincidencia[2] === undefined ? coincidencia[1] : Number(coincidencia[2]));
  }
  TOKEN_RUTA.lastIndex = 0;
  return pasos;
}

function leerRuta(estado: Pick<EstadoAplicablePlantilla, "bio" | "modulos">, ruta: string): unknown {
  if (ruta === "bio") return estado.bio;

  const match = RUTA_MODULO.exec(ruta);
  if (!match) return undefined;
  const [, tipo, indiceTexto, rutaConfig] = match;
  const indice = indiceTexto ? Number(indiceTexto) : 0;
  const modulo = estado.modulos.filter((item) => item.tipo === tipo)[indice];
  if (!modulo) return undefined;

  let valor: unknown = modulo.config;
  for (const paso of pasosDeRuta(rutaConfig)) {
    if (typeof paso === "number") {
      valor = Array.isArray(valor) ? valor[paso] : undefined;
    } else {
      valor = valor !== null && typeof valor === "object" ? (valor as Record<string, unknown>)[paso] : undefined;
    }
  }
  return valor;
}

/** Devuelve solo los ejemplos cuyo texto continúa intacto en el borrador. */
export function textosEjemploPendientes(
  estado: Pick<EstadoAplicablePlantilla, "bio" | "modulos">,
  plantilla: PlantillaPagina,
): TextoEjemplo[] {
  return plantilla.textosEjemplo.filter((ejemplo) => leerRuta(estado, ejemplo.ruta) === ejemplo.valor);
}
