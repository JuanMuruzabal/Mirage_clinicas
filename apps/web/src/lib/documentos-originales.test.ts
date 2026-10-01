import { describe, expect, it } from "vitest";
import { paginasDelOriginal } from "./documentos-originales";

describe("las páginas del modelo original", () => {
  it("el consentimiento de conducto tiene su página, en dos anchos y por versión", () => {
    const [pagina, ...resto] = paginasDelOriginal("consentimiento-tratamiento-conducto", 1);
    expect(resto).toHaveLength(0);
    const base = "/documentos-clinicos/originales/consentimiento-tratamiento-conducto/v1";
    expect(pagina.src).toBe(`${base}/pagina-1.w1600.webp`);
    expect(pagina.srcSet).toBe(`${base}/pagina-1.w800.webp 800w, ${base}/pagina-1.w1600.webp 1600w`);
    expect(pagina.srcImpresion).toBe(`${base}/pagina-1.w2550.webp`);
    expect(pagina.ancho).toBe(2550);
    expect(pagina.alto).toBeGreaterThan(pagina.ancho);
  });

  it("una plantilla, o una versión, sin original renderizado no tiene páginas", () => {
    expect(paginasDelOriginal("no-existe", 1)).toEqual([]);
    expect(paginasDelOriginal("consentimiento-tratamiento-conducto", 99)).toEqual([]);
  });

  // La v2 del conducto (TR-189, addendum) sale del mismo PDF, con sus
  // imágenes aparte: los documentos de la v1 siguen viendo las suyas.
  it("cada versión tiene sus páginas, en su propia carpeta", () => {
    const [v2] = paginasDelOriginal("consentimiento-tratamiento-conducto", 2);
    expect(v2.src).toBe("/documentos-clinicos/originales/consentimiento-tratamiento-conducto/v2/pagina-1.w1600.webp");
  });
});
