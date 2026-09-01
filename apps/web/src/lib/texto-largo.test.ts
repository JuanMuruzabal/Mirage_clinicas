import { describe, expect, it } from "vitest";
import { textoEsLargo } from "./texto-largo";

describe("textoEsLargo", () => {
  it("false para null/undefined/vacío/corto (<=30 caracteres)", () => {
    expect(textoEsLargo(null)).toBe(false);
    expect(textoEsLargo(undefined)).toBe(false);
    expect(textoEsLargo("")).toBe(false);
    expect(textoEsLargo("x".repeat(30))).toBe(false);
  });

  it("true para más de 30 caracteres", () => {
    expect(textoEsLargo("x".repeat(31))).toBe(true);
  });
});
