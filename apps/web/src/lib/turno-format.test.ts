import { describe, expect, it } from "vitest";
import { formatFechaHora, temaTipoConsulta } from "./turno-format";

describe("temaTipoConsulta", () => {
  // Corrección de QA (F2.3): el tema sale del color CONFIGURADO por el
  // profesional (tipo.color, tipo-consulta-form-modal.tsx), no de un
  // mapeo fijo por nombre — dos tipos con nombres distintos pero el
  // mismo color deben verse igual, y el acento siempre es ese mismo hex.
  it("deriva fondo/texto/acento del color configurado", () => {
    const tema = temaTipoConsulta({ color: "#6E8F72" });
    expect(tema.acento).toBe("#6E8F72");
    expect(tema.fondo).toContain("#6E8F72");
    expect(tema.texto).toContain("#6E8F72");
  });

  it("dos tipos con el mismo color resuelven al mismo tema, sin importar el nombre", () => {
    const a = temaTipoConsulta({ nombre: "Consulta general", color: "#D6563A" } as never);
    const b = temaTipoConsulta({ nombre: "Urgencia", color: "#D6563A" } as never);
    expect(a).toEqual(b);
  });

  it("sin tipo, devuelve un tema neutro (arena/grafito)", () => {
    const tema = temaTipoConsulta(undefined);
    expect(tema.fondo).toBe("var(--color-arena)");
    expect(tema.texto).toBe("var(--color-grafito)");
  });

  it("sin color configurado, devuelve el mismo tema neutro", () => {
    const tema = temaTipoConsulta({ color: "" });
    expect(tema.fondo).toBe("var(--color-arena)");
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
