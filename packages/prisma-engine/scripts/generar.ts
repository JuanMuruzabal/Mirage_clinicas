// pnpm engine:generar (PE-1) — exporta el esquema (zod) de cada módulo como
// JSON Schema y copia esquemas + catálogo de temas a
// apps/api/internal/prismaengine/, que los embebe con `go:embed` (Go no
// puede leer archivos fuera de su propio módulo). Es LA fuente que hace que
// el backend valide sin conocer los módulos por nombre — antes de esto,
// tiposModuloValidos/validarModulos (pagina_publica.go) y
// temasValidos/tipografiasValidas (temas_pagina_publica.go) eran un catálogo
// escrito a mano, aparte del de acá.
//
// CI corre esto y falla si el resultado difiere de lo commiteado (`git diff
// --exit-code`) — así que lo generado ACÁ es lo que hay que commitear, no
// algo que se arma solo en build. Escribe siempre con LF: junto a cada
// carpeta de salida va un .gitattributes (`* text eol=lf`) para que
// core.autocrlf=true de Windows no lo pise en el próximo checkout (ver la
// nota de CLAUDE.md sobre CRLF/LF en apps/api).
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ESQUEMAS_MODULOS, tokensSchema } from "../src/schemas";

const RAIZ_PAQUETE = path.resolve(import.meta.dirname, "..");
const CATALOGO_MODULOS = path.join(RAIZ_PAQUETE, "catalogo", "modulos");
const CATALOGO_TEMAS = path.join(RAIZ_PAQUETE, "catalogo", "temas.json");
const DESTINO_GO = path.resolve(RAIZ_PAQUETE, "..", "..", "apps", "api", "internal", "prismaengine");
const DESTINO_GO_MODULOS = path.join(DESTINO_GO, "modulos");

function escribir(rutaAbsoluta: string, contenido: string) {
  mkdirSync(path.dirname(rutaAbsoluta), { recursive: true });
  writeFileSync(rutaAbsoluta, contenido.endsWith("\n") ? contenido : `${contenido}\n`);
}

function limpiarJsonViejos(dir: string) {
  if (!existsSync(dir)) return;
  for (const archivo of readdirSync(dir)) {
    if (archivo.endsWith(".schema.json")) rmSync(path.join(dir, archivo));
  }
}

// draft-07 porque es lo que compila apps/api (jsonschema/v5 lee el $schema),
// y todo inline, sin $ref, como generaba zod-to-json-schema.
// io "output" porque Zod 4 solo cierra un z.object que descarta claves
// (additionalProperties: false) en modo output, que es lo que emitía
// zod-to-json-schema: con "input", Go pasaba a aceptar claves desconocidas en
// la raíz de los 14 módulos (medido con un corpus diferencial de 5899 casos).
// Revisarlo si un esquema de módulo suma un .default, .transform, .pipe o
// .catch: en output un campo con default queda requerido y Go rechazaría un
// payload que no lo trae.
function aJsonSchema(esquema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(esquema, { target: "draft-07", io: "output", reused: "inline", cycles: "throw" }), null, 2);
}

function gitattributesDe(dir: string) {
  return path.join(dir, ".gitattributes");
}

function main() {
  // Limpia lo viejo primero: si un módulo se saca del registro, su JSON no
  // debería sobrevivir huérfano (el criterio de aceptación de PE-1 exige
  // que sumar/sacar un módulo sea tocar solo su carpeta + regenerar).
  limpiarJsonViejos(CATALOGO_MODULOS);
  limpiarJsonViejos(DESTINO_GO_MODULOS);

  for (const [tipo, esquema] of Object.entries(ESQUEMAS_MODULOS)) {
    const contenido = aJsonSchema(esquema);
    escribir(path.join(CATALOGO_MODULOS, `${tipo}.schema.json`), contenido);
    escribir(path.join(DESTINO_GO_MODULOS, `${tipo}.schema.json`), contenido);
  }

  // PE-2: los tokens de diseño de la página se validan igual que la config
  // de un módulo — mismo generador, mismo JSON Schema, un solo archivo.
  const tokensJson = aJsonSchema(tokensSchema);
  escribir(path.join(RAIZ_PAQUETE, "catalogo", "tema_tokens.schema.json"), tokensJson);
  escribir(path.join(DESTINO_GO, "tema_tokens.schema.json"), tokensJson);

  copyFileSync(CATALOGO_TEMAS, path.join(DESTINO_GO, "temas.json"));

  escribir(gitattributesDe(CATALOGO_MODULOS), "* text eol=lf\n");
  escribir(gitattributesDe(DESTINO_GO), "* text eol=lf\n");

  console.log(`Generado: ${Object.keys(ESQUEMAS_MODULOS).length} esquemas de módulo + catálogo de temas → ${DESTINO_GO}`);
}

main();
