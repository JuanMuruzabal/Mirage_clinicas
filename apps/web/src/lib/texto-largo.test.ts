import { describe, expect, it } from "vitest";
import { textoEsLargo, tipoConsultaNombreEsLargo } from "./texto-largo";

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

// tipoConsultaNombreEsLargo — pedido textual del cliente: el umbral es
// "más largo que 'Consulta general', tomando en cuenta el espacio en
// blanco como carácter" — 16 caracteres exactos (8 + 1 espacio + 7).
// Distinto a propósito del umbral genérico de 30 de textoEsLargo.
describe("tipoConsultaNombreEsLargo", () => {
  it("false para null/undefined/vacío", () => {
    expect(tipoConsultaNombreEsLargo(null)).toBe(false);
    expect(tipoConsultaNombreEsLargo(undefined)).toBe(false);
    expect(tipoConsultaNombreEsLargo("")).toBe(false);
  });

  it("false para 'Consulta general' exacto (16 caracteres, el límite no cuenta como largo)", () => {
    expect("Consulta general").toHaveLength(16);
    expect(tipoConsultaNombreEsLargo("Consulta general")).toBe(false);
  });

  it("false para 16 caracteres cualquiera (el límite exacto, no solo el texto sembrado)", () => {
    expect(tipoConsultaNombreEsLargo("x".repeat(16))).toBe(false);
  });

  it("true para 17 caracteres o más (uno más largo que 'Consulta general')", () => {
    expect(tipoConsultaNombreEsLargo("x".repeat(17))).toBe(true);
    expect(tipoConsultaNombreEsLargo("Consulta generales")).toBe(true);
  });
});
