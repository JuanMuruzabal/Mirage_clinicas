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
// CI corre esto y falla si el resultado difiere de lo commiteado. Escribe
// siempre con LF, con un .gitattributes al lado (ver la nota de CLAUDE.md
// sobre CRLF en Windows).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { armarCuerpo } from "../src/texto";
import { PLANTILLAS } from "../src/registro";
import { valoresDeEjemplo } from "../src/ejemplo";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DESTINO = path.resolve(RAIZ, "..", "..", "apps", "api", "internal", "documentos");
const DESTINO_PLANTILLAS = path.join(DESTINO, "plantillas");
const DESTINO_FIXTURES = path.join(DESTINO, "fixtures");

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
    });
  }

  for (const dir of [DESTINO_PLANTILLAS, DESTINO_FIXTURES]) {
    writeFileSync(path.join(dir, ".gitattributes"), "* text eol=lf\n");
  }

  console.log(`Generado: ${PLANTILLAS.length} plantilla(s) y sus fixtures → ${DESTINO}`);
}

main();
