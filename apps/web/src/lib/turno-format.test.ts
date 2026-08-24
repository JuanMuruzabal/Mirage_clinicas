import { describe, expect, it } from "vitest";
import { formatFechaHora, temaTipoConsulta } from "./turno-format";

describe("temaTipoConsulta", () => {
  it("'Consulta general' resuelve al tema salvia", () => {
    const tema = temaTipoConsulta({ nombre: "Consulta general" });
    expect(tema).toEqual({
      fondo: "var(--color-salvia-claro)",
      texto: "var(--color-salvia-oscuro)",
      acento: "var(--color-salvia)",
    });
  });

  it("cualquier otro nombre (Urgencia u otros) resuelve al tema terracota", () => {
    expect(temaTipoConsulta({ nombre: "Urgencia" }).acento).toBe("var(--color-terracota)");
    expect(temaTipoConsulta({ nombre: "Control de rutina" }).acento).toBe("var(--color-terracota)");
  });

  it("sin tipo, devuelve un tema neutro (arena/grafito)", () => {
    const tema = temaTipoConsulta(undefined);
    expect(tema.fondo).toBe("var(--color-arena)");
    expect(tema.texto).toBe("var(--color-grafito)");
  });
});

describe("formatFechaHora", () => {
  it("sin iso, devuelve —", () => {
    expect(formatFechaHora(undefined)).toBe("—");
  });

  it("con iso, incluye fecha y hora separadas por ·", () => {
    expect(formatFechaHora("2026-09-01T13:00:00.000Z")).toContain("·");
  });
});
