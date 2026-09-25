import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TONO_SECUNDARIO } from "./estilos";

// Contraste del editor (PP-4, H11). jsdom no calcula colores, así que este
// test lo hace sobre la paleta real (`globals.css`): el tono secundario sobre
// los fondos del panel tiene que dar 4,5:1 (WCAG AA para texto chico), y
// ningún archivo del editor puede usar un grafito más claro que ese tono.

const aqui = dirname(fileURLToPath(import.meta.url));
const raizWeb = join(aqui, "..", "..", "..");
const repo = join(raizWeb, "..", "..");
const css = readFileSync(join(raizWeb, "src", "app", "globals.css"), "utf8");

function color(nombre: string): [number, number, number] {
  const m = css.match(new RegExp(`--color-${nombre}:\\s*#([0-9a-f]{6})`, "i"));
  if (!m) throw new Error(`--color-${nombre} no está en globals.css`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) as [number, number, number];
}

function luminancia([r, g, b]: [number, number, number]) {
  const lineal = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

function contraste(a: [number, number, number], b: [number, number, number]) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Un color con opacidad, compuesto sobre su fondo (lo que hace `text-grafito/75`). */
function sobre(frente: [number, number, number], alfa: number, fondo: [number, number, number]) {
  return frente.map((c, i) => alfa * c + (1 - alfa) * fondo[i]) as [number, number, number];
}

const FONDOS_DEL_PANEL = ["marfil", "hueso", "salvia-claro"];
const alfaSecundario = Number(TONO_SECUNDARIO.match(/text-grafito\/(\d+)/)![1]);

describe("contraste del editor", () => {
  it.each(FONDOS_DEL_PANEL)("el tono secundario da 4,5:1 sobre %s", (fondo) => {
    const f = color(fondo);
    expect(contraste(sobre(color("grafito"), alfaSecundario / 100, f), f)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["salvia-oscuro", "marfil"],
    ["salvia-oscuro", "salvia-claro"],
    ["terracota-oscuro", "marfil"],
    ["grafito", "hueso"],
  ])("%s sobre %s da 4,5:1", (texto, fondo) => {
    expect(contraste(color(texto), color(fondo))).toBeGreaterThanOrEqual(4.5);
  });

  it("ningún archivo del editor usa un grafito más claro que el tono secundario", () => {
    const carpetas = [
      join(raizWeb, "src", "components", "editor-pagina"),
      ...readdirSync(join(repo, "packages", "prisma-engine", "src", "modulos"), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(repo, "packages", "prisma-engine", "src", "modulos", d.name)),
    ];
    const archivos = [
      join(raizWeb, "src", "components", "pagina-editor.tsx"),
      join(repo, "packages", "prisma-engine", "src", "comunes.tsx"),
      ...carpetas.flatMap((c) =>
        readdirSync(c)
          .filter((a) => /^(?!.*\.test\.).*\.tsx?$/.test(a) && (c.includes("editor-pagina") || a === "editor.tsx"))
          .map((a) => join(c, a)),
      ),
    ];
    const claros = archivos.flatMap((archivo) =>
      [...readFileSync(archivo, "utf8").matchAll(/text-grafito\/(\d+)/g)]
        .filter(([, alfa]) => Number(alfa) < alfaSecundario)
        .map(([clase]) => `${archivo.slice(repo.length + 1)}: ${clase}`),
    );
    expect(claros).toEqual([]);
  });
});
