// pnpm documentos:generar (Fase 5.1, TR-183) — exporta cada plantilla a
// JSON y la copia a apps/api/internal/documentos/, que la embebe con
// `go:embed` (Go no puede leer fuera de su propio módulo). Mismo camino
// que `engine:generar` de la página pública.
//
// Además escribe un FIXTURE por plantilla: unos valores de ejemplo y el
// texto que este paquete arma con ellos, ya "sellado". La API arma el mismo
// texto en Go al terminar un documento (es lo que el paciente firma), y su
// test compara contra este fixture: si las dos implementaciones se separan,
// falla ahí y no en un documento real.
//
// Con la lámina (TR-187) el fixture suma la composición sobre la página
// original, y hay un archivo más de CASOS de composición (composicion/):
// textos armados para ejercitar cada rama —achicar, cortar por palabra y
// por carácter, centrar, desbordar, tildes— sobre zonas de prueba. Y la
// tabla de anchos de Helvetica se copia tal cual: Go compone con la misma.
//
// Con el odontograma (Fase 5.5) el fixture suma las FIGURAS, y
// composicion/figuras.json trae odontogramas armados para ejercitar cada
// rama (todas las caras arriba, abajo, a la derecha y a la izquierda; todas
// las marcas; las prótesis; los dientes existentes; vacío en borrador y
// terminado) sobre una geometría de prueba. Desde la 5.6b, también dibujos:
// un lienzo más ancho y uno más alto que su recuadro, un trazo de un solo
// punto, vacío en borrador y terminado, y un dibujo después de un
// odontograma.
//
// CI corre esto y falla si el resultado difiere de lo commiteado. Escribe
// siempre con LF, con un .gitattributes al lado (ver la nota de CLAUDE.md
// sobre CRLF en Windows).
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { armarCuerpo, type Modo } from "../src/texto";
import { armarLamina, componerZona } from "../src/lamina";
import { plantillaSchema, type Campo, type DibujoDeLamina, type OdontogramaDeLamina, type Plantilla, type RecuadroDePieza, type Zona } from "../src/esquema";
import type { ValorDibujo } from "../src/dibujo";
import { redondear2 } from "../src/metricas";
import { armarFiguras, filaDe, type CampoOdontograma, type FilaDeOdontograma, type ValorOdontograma } from "../src/odontograma";
import { piezasDe, type Denticion } from "../src/piezas";
import { PLANTILLAS } from "../src/registro";
import { valoresDeEjemplo } from "../src/ejemplo";
import { estaVacio, validarValores, valorComoTexto, type Valores } from "../src/valores";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DESTINO = path.resolve(RAIZ, "..", "..", "apps", "api", "internal", "documentos");
const DESTINO_PLANTILLAS = path.join(DESTINO, "plantillas");
const DESTINO_FIXTURES = path.join(DESTINO, "fixtures");
const DESTINO_COMPOSICION = path.join(DESTINO, "composicion");

/** Zonas y textos de prueba para la composición: cada uno fuerza una rama. */
const ZONA_CORTA: Zona = { id: "corta", pagina: 1, x: 85.1, y: 700.7, ancho: 16.2, alinear: "centro", texto: "{{x}}" };
const ZONA_RENGLON: Zona = { id: "renglon", pagina: 1, x: 164, y: 129.1, ancho: 129, texto: "{{x}}" };
const ZONA_CASILLAS: Zona = { id: "casillas", pagina: 1, x: 420.6, y: 205.35, ancho: 97.5, casillas: { cantidad: 5, paso: 19.5 }, texto: "{{x}}" };
const ZONA_PARRAFO: Zona = { id: "parrafo", pagina: 1, x: 86, y: 483.3, ancho: 435, lineas: 3, interlineado: 12.08, texto: "{{x}}" };
const LARGO =
  "Enjuagues con clorhexidina al 0,12 % dos veces por día durante siete días, después del cepillado. No comer ni beber hasta que pase la anestesia; evitar alimentos duros o muy calientes del lado tratado.";
const CASOS_DE_COMPOSICION: { zona: Zona; texto: string }[] = [
  { zona: ZONA_CORTA, texto: "07" },
  { zona: ZONA_CORTA, texto: "2026" },
  { zona: ZONA_CORTA, texto: "—" },
  { zona: { ...ZONA_CORTA, ancho: 1, alinear: undefined }, texto: "abc" },
  { zona: ZONA_RENGLON, texto: "María José Fernández" },
  { zona: ZONA_RENGLON, texto: "María José Fernández de la Colina Echeverría" },
  { zona: ZONA_RENGLON, texto: "Mariajosefernandezdelacolinaecheverriaquenoentraennada" },
  { zona: ZONA_RENGLON, texto: "Ñandú, ¿qué?\tsí" },
  { zona: ZONA_PARRAFO, texto: LARGO },
  { zona: ZONA_PARRAFO, texto: `${LARGO}\nSegunda indicación.\n\nTercera, después de un renglón en blanco.` },
  { zona: ZONA_PARRAFO, texto: `${LARGO} ${LARGO} ${LARGO}` },
  { zona: { ...ZONA_PARRAFO, tamano: 12, minimo: 11, alinear: "centro" }, texto: LARGO },
  // Sangría (Fase 5.2): el primer renglón, más angosto y corrido.
  { zona: { ...ZONA_PARRAFO, sangria: 118.3 }, texto: LARGO },
  { zona: { ...ZONA_PARRAFO, sangria: 300 }, texto: `${LARGO} ${LARGO}` },
  { zona: { ...ZONA_PARRAFO, sangria: 200, alinear: "centro" }, texto: `Corto.\n${LARGO}` },
  { zona: { ...ZONA_PARRAFO, sangria: 430 }, texto: "Mariajosefernandezdelacolina" },
  // Casillas de a un carácter (Fase 5.5): normal, con un espacio y otro
  // tamaño, que desborda y vacía.
  { zona: ZONA_CASILLAS, texto: "4512" },
  { zona: { ...ZONA_CASILLAS, tamano: 9 }, texto: "Ñ 4W" },
  { zona: ZONA_CASILLAS, texto: "1234567" },
  { zona: ZONA_CASILLAS, texto: "" },
];

// --- Los casos de figuras del odontograma --------------------------------

/** Una geometría de prueba con las filas del papel. Los lados y las alturas
 *  cambian de una pieza a la de al lado: así la barra de una prótesis
 *  ejercita el max/min entre sus dos puntas. */
const FILAS_DE_PRUEBA: Record<FilaDeOdontograma, { y: number; desde: number }> = {
  "sup-perm": { y: 101.3, desde: 0 },
  "inf-perm": { y: 131.9, desde: 0 },
  "sup-temp": { y: 171.45, desde: 3 },
  "inf-temp": { y: 202.1, desde: 3 },
};

function recuadrosDePrueba(denticion: Denticion): RecuadroDePieza[] {
  const columnas = new Map<FilaDeOdontograma, number>();
  return piezasDe(denticion).map((pieza) => {
    const fila = filaDe(pieza);
    const i = columnas.get(fila) ?? 0;
    columnas.set(fila, i + 1);
    const { y, desde } = FILAS_DE_PRUEBA[fila];
    return { pieza, x: redondear2(28.35 + (desde + i) * 21.7), y: redondear2(y + (i % 2) * 0.7), lado: redondear2(17.3 + (i % 3) * 0.45) };
  });
}

const CAJA_DE_EXISTENTES = { x: 400.15, y: 190.6, ancho: 44.3 };

type OpcionesDelCampo = Pick<CampoOdontograma, "leyenda" | "denticion" | "existentes">;

function plantillaDePrueba(opciones: OpcionesDelCampo, caja: OdontogramaDeLamina["existentes"]): Plantilla {
  const odontograma: OdontogramaDeLamina = {
    campo: "odontograma",
    pagina: 1,
    piezas: recuadrosDePrueba(opciones.denticion ?? "ambas"),
    ...(opciones.existentes ? { existentes: caja } : {}),
  };
  return plantillaSchema.parse({
    id: "odontograma-de-prueba",
    version: 1,
    nombre: "Odontograma de prueba",
    tipo: "historia_clinica",
    descripcion: "Un odontograma solo, para los casos de figuras.",
    fuente: { nombre: "Casos de prueba", url: "https://colodontcba.org.ar/" },
    secciones: [{ id: "examen", titulo: "Examen", campos: [{ tipo: "odontograma", id: "odontograma", etiqueta: "Odontograma", ...opciones }] }],
    cuerpo: [{ t: "campo", campo: "odontograma" }, { t: "firmas" }],
    firmas: [{ rol: "profesional", etiqueta: "Profesional", requerida: true }],
    lamina: {
      paginas: [{ ancho: 595, alto: 842 }],
      zonas: [{ id: "titulo", pagina: 1, x: 28.35, y: 80, ancho: 200, texto: "Odontograma" }],
      firmas: [{ rol: "profesional", pagina: 1, x: 380, y: 800, ancho: 150, alto: 40 }],
      odontogramas: [odontograma],
    },
  });
}

const TODAS_LAS_CARAS = { V: "rojo", L: "azul", M: "rojo", D: "azul", O: "rojo" } as const;
const AL_REVES = { O: "azul", D: "rojo", M: "azul", L: "rojo", V: "azul" } as const;
const GENERAL: OpcionesDelCampo = { leyenda: "general" };
const CON_EXISTENTES: OpcionesDelCampo = { leyenda: "general", existentes: true };
const UNA_AUSENTE: ValorOdontograma = { piezas: { "47": { marcas: { x: "azul" } } } };

interface CasoDeFiguras {
  nombre: string;
  campo: OpcionesDelCampo;
  caja?: OdontogramaDeLamina["existentes"];
  modo: Modo;
  valor?: ValorOdontograma;
}

const CASOS_DE_FIGURAS: CasoDeFiguras[] = [
  {
    nombre: "todas las caras: superiores e inferiores, de la derecha y de la izquierda, permanentes y temporarias",
    campo: GENERAL,
    modo: "borrador",
    valor: {
      piezas: {
        "16": { caras: TODAS_LAS_CARAS },
        "21": { caras: AL_REVES },
        "36": { caras: TODAS_LAS_CARAS },
        "44": { caras: AL_REVES },
        "55": { caras: AL_REVES },
        "62": { caras: TODAS_LAS_CARAS },
        "73": { caras: AL_REVES },
        "84": { caras: TODAS_LAS_CARAS },
      },
    },
  },
  {
    nombre: "todas las marcas, después de las caras y de la más grande a la más chica",
    campo: { leyenda: "pediatrica" },
    modo: "sellado",
    valor: {
      piezas: {
        // Las cuatro en una pieza: con la X azul (a extraer), lo demás es lo existente.
        "54": { caras: { O: "rojo" }, marcas: { traumatizado: "rojo", sellador: "rojo", x: "azul", corona: "rojo" } },
        "11": { marcas: { traumatizado: "azul" } },
        "85": { marcas: { sellador: "rojo" } },
        "71": { marcas: { x: "azul", corona: "rojo" } },
      },
    },
  },
  {
    nombre: "prótesis fijas y removibles, arriba y abajo, en el orden del texto",
    campo: GENERAL,
    modo: "sellado",
    valor: {
      protesis: [
        { tipo: "removible", desde: "46", hasta: "43", color: "rojo" },
        { tipo: "fija", desde: "34", hasta: "31", color: "azul" },
        { tipo: "removible", desde: "15", hasta: "17", color: "azul" },
        { tipo: "fija", desde: "23", hasta: "13", color: "rojo" },
        { tipo: "fija", desde: "28", hasta: "26", color: "rojo" },
        { tipo: "fija", desde: "24", hasta: "25", color: "rojo" },
        { tipo: "fija", desde: "52", hasta: "62", color: "azul" },
        { tipo: "removible", desde: "83", hasta: "81", color: "azul" },
      ],
    },
  },
  {
    nombre: "dientes existentes con valor, en una caja con tamaño propio",
    campo: { leyenda: "general", denticion: "permanente", existentes: true },
    caja: { ...CAJA_DE_EXISTENTES, tamano: 9 },
    modo: "sellado",
    valor: { existentes: 27 },
  },
  { nombre: "dientes existentes sin valor, terminado", campo: CON_EXISTENTES, modo: "sellado", valor: UNA_AUSENTE },
  { nombre: "dientes existentes sin valor, borrador", campo: CON_EXISTENTES, modo: "borrador", valor: UNA_AUSENTE },
  { nombre: "vacío y terminado, con la caja de existentes", campo: CON_EXISTENTES, modo: "sellado" },
  { nombre: "vacío en borrador", campo: CON_EXISTENTES, modo: "borrador" },
  {
    nombre: "vacío y terminado: una pieza con caras y marcas vacías no cuenta",
    campo: { leyenda: "general", denticion: "permanente" },
    modo: "sellado",
    valor: { piezas: { "11": { caras: {}, marcas: {} } }, protesis: [] },
  },
  { nombre: "solo temporarias, vacío y terminado", campo: { leyenda: "pediatrica", denticion: "temporaria" }, modo: "sellado" },
];

function casoDeFiguras({ nombre, campo, caja = CAJA_DE_EXISTENTES, modo, valor }: CasoDeFiguras) {
  const plantilla = plantillaDePrueba(campo, caja);
  const valores = valor === undefined ? {} : { odontograma: valor };
  // Un caso tiene que ser un valor válido: es lo único que la API congela.
  const errores = validarValores(plantilla, valores, "estricto");
  if (errores.length > 0) throw new Error(`el caso de figuras "${nombre}" no valida: ${JSON.stringify(errores)}`);
  const texto = valorComoTexto(plantilla.secciones[0].campos[0], valor);
  return { nombre, plantilla, valores, modo, texto, figuras: armarFiguras(plantilla, valores, modo) };
}

// --- Los casos de figuras de un dibujo (Fase 5.6b) --------------------------

const RECUADRO_DE_DIBUJO: DibujoDeLamina = { campo: "dibujo", pagina: 1, x: 26.85, y: 300.4, ancho: 261.3, alto: 97.15 };

function plantillaDeDibujo(conOdontograma: boolean): Plantilla {
  const dibujo: Campo = { tipo: "dibujo", id: "dibujo", etiqueta: "Genograma" };
  const odontograma: Campo = { tipo: "odontograma", id: "odontograma", etiqueta: "Odontograma", leyenda: "pediatrica" };
  const campos = conOdontograma ? [odontograma, dibujo] : [dibujo];
  return plantillaSchema.parse({
    id: "dibujo-de-prueba",
    version: 1,
    nombre: "Dibujo de prueba",
    tipo: "anexo",
    descripcion: "Un dibujo, para los casos de figuras.",
    fuente: { nombre: "Casos de prueba", url: "https://colodontcba.org.ar/" },
    secciones: [{ id: "examen", titulo: "Examen", campos }],
    cuerpo: [...campos.map((c) => ({ t: "campo", campo: c.id })), { t: "firmas" }],
    firmas: [{ rol: "profesional", etiqueta: "Profesional", requerida: true }],
    lamina: {
      paginas: [{ ancho: 595, alto: 842 }],
      zonas: [{ id: "titulo", pagina: 1, x: 28.35, y: 80, ancho: 200, texto: "Dibujo" }],
      firmas: [{ rol: "profesional", pagina: 1, x: 380, y: 800, ancho: 150, alto: 40 }],
      dibujos: [RECUADRO_DE_DIBUJO],
      ...(conOdontograma ? { odontogramas: [{ campo: "odontograma", pagina: 1, piezas: recuadrosDePrueba("ambas") }] } : {}),
    },
  });
}

const CASOS_DE_DIBUJO: { nombre: string; modo: Modo; valor?: ValorDibujo; conOdontograma?: boolean }[] = [
  {
    nombre: "dibujo: un lienzo más ancho que el recuadro, centrado de arriba abajo, con un trazo de un solo punto",
    modo: "borrador",
    valor: { ancho: 800, alto: 200, trazos: [[[0, 0], [12.5, 40.25], [399.99, 100], [800, 200]], [[640.5, 33.33]], [[100, 180], [100, 180.01]]] },
  },
  {
    nombre: "dibujo: un lienzo más alto que el recuadro, centrado de costado, terminado",
    modo: "sellado",
    valor: { ancho: 300, alto: 600, trazos: [[[10, 20], [290, 20], [290, 580], [10, 580], [10, 20]], [[150.75, 300.25]]] },
  },
  { nombre: "dibujo: sin trazos y terminado dice No consigna", modo: "sellado", valor: { ancho: 400, alto: 150, trazos: [] } },
  { nombre: "dibujo: sin valor y terminado dice No consigna", modo: "sellado" },
  { nombre: "dibujo: sin trazos en borrador no dibuja nada", modo: "borrador", valor: { ancho: 400, alto: 150, trazos: [] } },
  {
    nombre: "dibujo: después de los odontogramas",
    modo: "sellado",
    conOdontograma: true,
    valor: { ancho: 261, alto: 97, trazos: [[[5, 5], [256, 92]]] },
  },
];

function casoDeDibujo({ nombre, modo, valor, conOdontograma = false }: (typeof CASOS_DE_DIBUJO)[number]) {
  const plantilla = plantillaDeDibujo(conOdontograma);
  const valores: Valores = {
    ...(valor === undefined ? {} : { dibujo: valor }),
    ...(conOdontograma ? { odontograma: { piezas: { "55": { marcas: { sellador: "azul" } } } } } : {}),
  };
  const errores = validarValores(plantilla, valores, "estricto");
  if (errores.length > 0) throw new Error(`el caso de dibujo "${nombre}" no valida: ${JSON.stringify(errores)}`);
  const campo = plantilla.secciones[0].campos[0];
  return { nombre, plantilla, valores, modo, texto: valorComoTexto(campo, valores[campo.id]), figuras: armarFiguras(plantilla, valores, modo) };
}

/** Cuándo un odontograma está vacío: solo un valor bien formado sin nada
 *  cargado. La basura no cuenta como vacía, así que no se guarda sin
 *  validar: tiene que dar su error. */
const CASOS_DE_VACIO: { nombre: string; valor: unknown }[] = [
  { nombre: "un objeto sin nada", valor: {} },
  { nombre: "piezas con caras y marcas sin claves, prótesis vacía", valor: { piezas: { "11": { caras: {}, marcas: {} }, "55": {} }, protesis: [] } },
  { nombre: "basura: una clave que no es del odontograma", valor: { notas: "sin nada" } },
  { nombre: "basura: una pieza que no es un objeto", valor: { piezas: { "16": "rojo" } } },
  { nombre: "basura: una pieza que no existe, aunque esté vacía", valor: { piezas: { "99": {} } } },
  { nombre: "basura: un texto vacío no es un odontograma", valor: "" },
];

function casoDeVacio({ nombre, valor }: (typeof CASOS_DE_VACIO)[number]) {
  const plantilla = plantillaDePrueba(GENERAL, undefined);
  const campo = plantilla.secciones[0].campos[0];
  const [error] = validarValores(plantilla, { odontograma: valor }, "estricto");
  return { nombre, campo, valor, vacio: estaVacio(campo, valor), mensaje: error?.mensaje ?? null };
}

/** El día fijo de los fixtures: no depende de cuándo se corra. */
const FECHA_DE_EJEMPLO = "2026-09-27";

// --- La aclaración de un sí o no (`{{campo:detalle}}`) ---------------------

const PLANTILLA_DE_DETALLE: Plantilla = plantillaSchema.parse({
  id: "detalle-de-prueba",
  version: 1,
  nombre: "Aclaración de prueba",
  tipo: "historia_clinica",
  descripcion: "Un sí o no con aclaración, para los casos de `{{campo:detalle}}`.",
  fuente: { nombre: "Casos de prueba", url: "https://colodontcba.org.ar/" },
  secciones: [
    {
      id: "salud",
      titulo: "Salud",
      campos: [{ tipo: "si_no", id: "medicacion", etiqueta: "¿Toma medicación?", detalle: { etiqueta: "¿Cuál?", cuando: "si" } }],
    },
  ],
  cuerpo: [{ t: "campo", campo: "medicacion" }, { t: "firmas" }],
  firmas: [{ rol: "profesional", etiqueta: "Profesional", requerida: true }],
  lamina: {
    paginas: [{ ancho: 595, alto: 842 }],
    zonas: [
      { id: "respuesta", pagina: 1, x: 60, y: 100, ancho: 200, texto: "{{medicacion}}" },
      { id: "detalle", pagina: 1, x: 60, y: 112, ancho: 200, texto: "{{medicacion:detalle}}" },
      { id: "detalle_con_rotulo", pagina: 1, x: 60, y: 124, ancho: 200, texto: "Cuál: {{medicacion:detalle}}", vacio: "—" },
    ],
    firmas: [{ rol: "profesional", pagina: 1, x: 380, y: 800, ancho: 150, alto: 40 }],
  },
});

/** Solo la aclaración, recortada; una aclaración vacía cuenta como un
 *  campo sin cargar, en borrador y terminado. */
const CASOS_DE_DETALLE: { nombre: string; valor?: Valores[string]; modo: Modo }[] = [
  { nombre: "sí con aclaración", valor: { respuesta: "si", detalle: "  Enalapril 10 mg  " }, modo: "sellado" },
  { nombre: "no con aclaración", valor: { respuesta: "no", detalle: "Ya no" }, modo: "sellado" },
  { nombre: "sí con la aclaración en blanco, terminado", valor: { respuesta: "si", detalle: "   " }, modo: "sellado" },
  { nombre: "sí sin aclaración, borrador", valor: { respuesta: "si" }, modo: "borrador" },
  { nombre: "sin respuesta, terminado", modo: "sellado" },
];

function casoDeDetalle({ nombre, valor, modo }: (typeof CASOS_DE_DETALLE)[number]) {
  const valores: Valores = valor === undefined ? {} : { medicacion: valor };
  const contexto = { fecha: FECHA_DE_EJEMPLO };
  return { nombre, plantilla: PLANTILLA_DE_DETALLE, valores, contexto, modo, lamina: armarLamina(PLANTILLA_DE_DETALLE, valores, contexto, modo) };
}

function escribir(ruta: string, datos: unknown) {
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(datos, null, 2)}\n`);
}

function limpiar(dir: string) {
  if (!existsSync(dir)) return;
  for (const archivo of readdirSync(dir)) if (archivo.endsWith(".json")) rmSync(path.join(dir, archivo));
}

function main() {
  limpiar(DESTINO_PLANTILLAS);
  limpiar(DESTINO_FIXTURES);
  limpiar(DESTINO_COMPOSICION);

  for (const plantilla of PLANTILLAS) {
    const nombre = `${plantilla.id}.v${plantilla.version}.json`;
    escribir(path.join(DESTINO_PLANTILLAS, nombre), plantilla);

    const contexto = { fecha: FECHA_DE_EJEMPLO };
    const valores = valoresDeEjemplo(plantilla);
    escribir(path.join(DESTINO_FIXTURES, nombre), {
      plantilla: plantilla.id,
      version: plantilla.version,
      contexto,
      valores,
      cuerpo: armarCuerpo(plantilla, valores, contexto, "sellado"),
      lamina: armarLamina(plantilla, valores, contexto, "sellado"),
      figuras: armarFiguras(plantilla, valores, "sellado"),
    });
  }

  escribir(
    path.join(DESTINO_COMPOSICION, "casos.json"),
    CASOS_DE_COMPOSICION.map(({ zona, texto }) => ({ zona, texto, compuesta: componerZona(zona, texto) })),
  );
  escribir(path.join(DESTINO_COMPOSICION, "figuras.json"), [...CASOS_DE_FIGURAS.map(casoDeFiguras), ...CASOS_DE_DIBUJO.map(casoDeDibujo)]);
  escribir(path.join(DESTINO_COMPOSICION, "odontograma-vacio.json"), CASOS_DE_VACIO.map(casoDeVacio));
  escribir(path.join(DESTINO_COMPOSICION, "detalle.json"), CASOS_DE_DETALLE.map(casoDeDetalle));
  copyFileSync(path.join(RAIZ, "src", "metricas-helvetica.json"), path.join(DESTINO, "metricas-helvetica.json"));

  for (const dir of [DESTINO_PLANTILLAS, DESTINO_FIXTURES, DESTINO_COMPOSICION]) {
    writeFileSync(path.join(dir, ".gitattributes"), "* text eol=lf\n");
  }

  console.log(`Generado: ${PLANTILLAS.length} plantilla(s) y sus fixtures → ${DESTINO}`);
}

main();
