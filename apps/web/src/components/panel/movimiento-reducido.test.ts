import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// jsdom no aplica CSS ni media queries: se lee la hoja. Lo que se protege
// es la regla de "reducir movimiento" del panel y de la home — hasta el
// 2026-09-27 apagaba todas las animaciones, y en Android (donde el ahorro
// de batería prende esa preferencia) el panel no tenía ninguna.
function bloqueReducido(css: string, desde: string): string {
  const i = css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(desde));
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("\n}\n", i));
}

describe("movimiento reducido: fundido, no nada", () => {
  it("panel: las tarjetas aparecen con un fundido", () => {
    const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
    const bloque = bloqueReducido(css, ".despliegue-cifra");
    expect(bloque).toContain("animation-name: despliegue-fundido");
    expect(bloque).not.toMatch(/\.despliegue-cuerpo,[^{]*\{\s*animation: none/);
    expect(css).toMatch(/@keyframes despliegue-fundido \{ from \{ opacity: 0; \}/);
  });

  it("home: cada parte aparece con un fundido, y los dibujos quedan quietos", () => {
    const css = readFileSync(join(__dirname, "../../app/home.css"), "utf8");
    const bloque = bloqueReducido(css, ".dib-portada");
    expect(bloque).toContain("animation-name: rv-fundido");
    expect(bloque).toMatch(/\.dib-vapor[^{]*\{\s*animation: none !important/);
    expect(css).toMatch(/@keyframes rv-fundido \{ from \{ opacity: 0; \}/);
  });
});
