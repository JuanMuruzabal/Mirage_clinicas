import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import temas from "../catalogo/temas.json";
import { ESTILOS_MOVIMIENTO } from "../src/efectos/catalogo";
import { tokensSchema, ESQUEMAS_MODULOS } from "../src/schemas";
import { CATALOGO_PRESETS_ESTILO, CATALOGO_PRESETS_SECCION } from "../src/plantillas/presets";

const RAIZ_PAQUETE = path.resolve(import.meta.dirname, "..");
const DIRECTORIO_PLANTILLAS = path.join(RAIZ_PAQUETE, "plantillas");

const moduloPlantillaSchema = z.object({
  tipo: z.string().min(1),
  visible: z.boolean(),
  config: z.record(z.unknown()),
}).strict();

const textoEjemploSchema = z.object({
  ruta: z.string().min(1),
  valor: z.string().min(1),
  etiqueta: z.string().min(1),
}).strict();

const plantillaSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  nombre: z.string().min(1),
  rubro: z.enum(["odontologia", "kinesiologia", "nutricion"]),
  estilo: z.enum(["clinico-sereno", "calido-dinamico"]),
  descripcion: z.string().min(1),
  tema: z.string().min(1),
  temaVariante: z.string().min(1),
  temaTipografia: z.string().min(1),
  temaTokens: z.record(z.unknown()),
  estiloMovimiento: z.enum(ESTILOS_MOVIMIENTO),
  bio: z.string(),
  fotoPortadaUrl: z.literal(""),
  redes: z.record(z.string()),
  mostrarMapa: z.boolean(),
  direccionOverride: z.string(),
  nombreSobrePortada: z.boolean(),
  nombreColor: z.string(),
  modulos: z.array(moduloPlantillaSchema).min(1),
  textosEjemplo: z.array(textoEjemploSchema),
}).strict();

const identidadVisualSchema = z.object({
  tema: z.string().min(1),
  temaVariante: z.string().min(1),
  temaTipografia: z.string().min(1),
  temaTokens: z.record(z.unknown()),
  estiloMovimiento: z.enum(ESTILOS_MOVIMIENTO),
}).strict();

const presetEstiloSchema = identidadVisualSchema.extend({
  id: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().min(1),
});

const presetSeccionSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().min(1),
  modulo: moduloPlantillaSchema,
}).strict();

type ModuloValidable = z.infer<typeof moduloPlantillaSchema>;
type PlantillaValidable = z.infer<typeof plantillaSchema>;

const errores: string[] = [];

function informar(donde: string, mensaje: string) {
  errores.push(`${donde}: ${mensaje}`);
}

function explicarIssues(issues: readonly z.ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".") || "<raíz>"}: ${issue.message}`).join("; ");
}

function validarIdentidadVisual(
  item: Pick<PlantillaValidable, "tema" | "temaVariante" | "temaTipografia" | "temaTokens" | "estiloMovimiento">,
  donde: string,
) {
  const variantes = (temas.temas as Record<string, unknown>)[item.tema];
  if (!Array.isArray(variantes)) {
    informar(donde, `tema desconocido "${item.tema}"`);
  } else if (!variantes.includes(item.temaVariante)) {
    informar(donde, `variante "${item.temaVariante}" no pertenece al tema "${item.tema}"`);
  }

  if (!(temas.tipografias as unknown[]).includes(item.temaTipografia)) {
    informar(donde, `tipografía desconocida "${item.temaTipografia}"`);
  }

  if (!(ESTILOS_MOVIMIENTO as readonly string[]).includes(item.estiloMovimiento)) {
    informar(donde, `estilo de movimiento desconocido "${item.estiloMovimiento}"`);
  }
  const movimientoEnTokens = item.temaTokens.movimiento;
  if (movimientoEnTokens !== undefined && movimientoEnTokens !== item.estiloMovimiento) {
    informar(donde, `temaTokens.movimiento (${String(movimientoEnTokens)}) no coincide con estiloMovimiento (${item.estiloMovimiento})`);
  }

  const tokens = tokensSchema.safeParse({ ...item.temaTokens, movimiento: item.estiloMovimiento });
  if (!tokens.success) informar(donde, `tokens inválidos: ${explicarIssues(tokens.error.issues)}`);
  else if (!isDeepStrictEqual(tokens.data, { ...item.temaTokens, movimiento: item.estiloMovimiento })) {
    informar(donde, "tokens contienen campos o valores que el schema normalizó");
  }
}

function validarModulo(modulo: ModuloValidable, donde: string) {
  const esquema = ESQUEMAS_MODULOS[modulo.tipo as keyof typeof ESQUEMAS_MODULOS];
  if (!esquema) {
    informar(donde, `tipo de módulo desconocido "${modulo.tipo}"`);
    return;
  }

  const parseo = esquema.safeParse(modulo.config);
  if (!parseo.success) {
    informar(donde, `config de ${modulo.tipo} inválida: ${explicarIssues(parseo.error.issues)}`);
  } else if (!isDeepStrictEqual(parseo.data, modulo.config)) {
    informar(donde, `config de ${modulo.tipo} contiene campos o valores que su schema normalizó`);
  }
}

function segmentosDeRuta(ruta: string): Array<string | number> | undefined {
  const segmentos: Array<string | number> = [];
  const partes = ruta.split(".");
  for (const parte of partes) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/.exec(parte);
    if (!match) return undefined;
    segmentos.push(match[1]);
    if (match[2] !== undefined) segmentos.push(Number(match[2]));
  }
  return segmentos;
}

function resolverRutaEjemplo(plantilla: PlantillaValidable, ruta: string): unknown {
  if (ruta === "bio") return plantilla.bio;
  const match = /^modulos\.([a-z][a-z0-9_]*)(?:\[(\d+)\])?\.config\.(.+)$/.exec(ruta);
  if (!match) return undefined;

  const [, tipo, indiceTexto, rutaConfig] = match;
  const modulo = plantilla.modulos.filter((item) => item.tipo === tipo)[indiceTexto ? Number(indiceTexto) : 0];
  if (!modulo) return undefined;
  const segmentos = segmentosDeRuta(rutaConfig);
  if (!segmentos) return undefined;

  let valor: unknown = modulo.config;
  for (const segmento of segmentos) {
    if (typeof segmento === "number") {
      valor = Array.isArray(valor) ? valor[segmento] : undefined;
    } else {
      valor = valor !== null && typeof valor === "object"
        ? (valor as Record<string, unknown>)[segmento]
        : undefined;
    }
  }
  return valor;
}

function validarPlantilla(plantilla: PlantillaValidable, archivo: string) {
  const donde = `plantilla ${plantilla.id}`;
  if (`${plantilla.id}.json` !== archivo) informar(donde, `el nombre del archivo debe ser "${plantilla.id}.json"`);
  validarIdentidadVisual(plantilla, donde);

  for (const [indice, modulo] of plantilla.modulos.entries()) {
    validarModulo(modulo, `${donde}.modulos[${indice}]`);
  }

  const rutas = new Set<string>();
  for (const [indice, ejemplo] of plantilla.textosEjemplo.entries()) {
    const etiqueta = `${donde}.textosEjemplo[${indice}]`;
    if (rutas.has(ejemplo.ruta)) informar(etiqueta, `ruta de ejemplo repetida "${ejemplo.ruta}"`);
    rutas.add(ejemplo.ruta);
    const texto = resolverRutaEjemplo(plantilla, ejemplo.ruta);
    if (typeof texto !== "string") informar(etiqueta, `ruta no resuelta o no textual "${ejemplo.ruta}"`);
    else if (texto !== ejemplo.valor) informar(etiqueta, `el valor no coincide con la ruta "${ejemplo.ruta}"`);
  }
}

function leerPlantillas(): PlantillaValidable[] {
  const archivos = readdirSync(DIRECTORIO_PLANTILLAS).filter((nombre) => nombre.endsWith(".json")).sort();
  if (archivos.length === 0) {
    informar("plantillas", "no hay archivos JSON para validar");
    return [];
  }

  const ids = new Set<string>();
  const plantillas: PlantillaValidable[] = [];
  for (const archivo of archivos) {
    const ruta = path.join(DIRECTORIO_PLANTILLAS, archivo);
    let dato: unknown;
    try {
      dato = JSON.parse(readFileSync(ruta, "utf8"));
    } catch (error) {
      informar(archivo, `JSON inválido: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const parseo = plantillaSchema.safeParse(dato);
    if (!parseo.success) {
      informar(archivo, `estructura inválida: ${explicarIssues(parseo.error.issues)}`);
      continue;
    }
    if (ids.has(parseo.data.id)) informar(archivo, `ID de plantilla duplicado "${parseo.data.id}"`);
    ids.add(parseo.data.id);
    validarPlantilla(parseo.data, archivo);
    plantillas.push(parseo.data);
  }
  return plantillas;
}

function validarPresetsEstilo() {
  const ids = new Set<string>();
  for (const dato of CATALOGO_PRESETS_ESTILO) {
    const parseo = presetEstiloSchema.safeParse(dato);
    if (!parseo.success) {
      informar(`preset de estilo ${"id" in dato ? String(dato.id) : "<sin ID>"}`, `estructura inválida: ${explicarIssues(parseo.error.issues)}`);
      continue;
    }
    const preset = parseo.data;
    const donde = `preset de estilo ${preset.id}`;
    if (ids.has(preset.id)) informar(donde, `ID duplicado "${preset.id}"`);
    ids.add(preset.id);
    validarIdentidadVisual(preset, donde);
  }
}

function validarPresetsSeccion() {
  const ids = new Set<string>();
  for (const dato of CATALOGO_PRESETS_SECCION) {
    const parseo = presetSeccionSchema.safeParse(dato);
    if (!parseo.success) {
      informar(`preset de sección ${"id" in dato ? String(dato.id) : "<sin ID>"}`, `estructura inválida: ${explicarIssues(parseo.error.issues)}`);
      continue;
    }
    const preset = parseo.data;
    const donde = `preset de sección ${preset.id}`;
    if (ids.has(preset.id)) informar(donde, `ID duplicado "${preset.id}"`);
    ids.add(preset.id);
    validarModulo(parseo.data.modulo, donde);
  }
}

const plantillas = leerPlantillas();
validarPresetsEstilo();
validarPresetsSeccion();

if (errores.length > 0) {
  console.error(`Validación de plantillas Prisma Engine: ${errores.length} error(es)`);
  for (const error of errores) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Plantillas y presets válidos: ${plantillas.length} plantillas, ${CATALOGO_PRESETS_ESTILO.length} presets de estilo y ${CATALOGO_PRESETS_SECCION.length} presets de sección.`);
}
