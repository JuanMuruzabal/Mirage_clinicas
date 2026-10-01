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
// CI corre esto y falla si el resultado difiere de lo commiteado. Escribe
// siempre con LF, con un .gitattributes al lado (ver la nota de CLAUDE.md
// sobre CRLF en Windows).
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { armarCuerpo } from "../src/texto";
import { armarLamina, componerZona } from "../src/lamina";
import type { Zona } from "../src/esquema";
import { PLANTILLAS } from "../src/registro";
import { valoresDeEjemplo } from "../src/ejemplo";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DESTINO = path.resolve(RAIZ, "..", "..", "apps", "api", "internal", "documentos");
const DESTINO_PLANTILLAS = path.join(DESTINO, "plantillas");
const DESTINO_FIXTURES = path.join(DESTINO, "fixtures");
const DESTINO_COMPOSICION = path.join(DESTINO, "composicion");

/** Zonas y textos de prueba para la composición: cada uno fuerza una rama. */
const ZONA_CORTA: Zona = { id: "corta", pagina: 1, x: 85.1, y: 700.7, ancho: 16.2, alinear: "centro", texto: "{{x}}" };
const ZONA_RENGLON: Zona = { id: "renglon", pagina: 1, x: 164, y: 129.1, ancho: 129, texto: "{{x}}" };
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
];

/** El día fijo de los fixtures: no depende de cuándo se corra. */
const FECHA_DE_EJEMPLO = "2026-09-27";

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
    });
  }

  escribir(
    path.join(DESTINO_COMPOSICION, "casos.json"),
    CASOS_DE_COMPOSICION.map(({ zona, texto }) => ({ zona, texto, compuesta: componerZona(zona, texto) })),
  );
  copyFileSync(path.join(RAIZ, "src", "metricas-helvetica.json"), path.join(DESTINO, "metricas-helvetica.json"));

  for (const dir of [DESTINO_PLANTILLAS, DESTINO_FIXTURES, DESTINO_COMPOSICION]) {
    writeFileSync(path.join(dir, ".gitattributes"), "* text eol=lf\n");
  }

  console.log(`Generado: ${PLANTILLAS.length} plantilla(s) y sus fixtures → ${DESTINO}`);
}

main();
