import { describe, expect, it } from "vitest";
import { filtrosDeTab, parseTab, parseVerificacion, RANGOS_RAPIDOS } from "./turnos-filtros";

describe("parseTab", () => {
  it("acepta resuelto/cancelada/todas tal cual", () => {
    expect(parseTab("resuelto")).toBe("resuelto");
    expect(parseTab("cancelada")).toBe("cancelada");
    expect(parseTab("todas")).toBe("todas");
  });

  it("cualquier otro valor (incluido undefined) cae en agendado", () => {
    expect(parseTab(undefined)).toBe("agendado");
    expect(parseTab("pendiente")).toBe("agendado");
    expect(parseTab("")).toBe("agendado");
  });
});

describe("parseVerificacion", () => {
  it("acepta verificado/sin_verificar tal cual", () => {
    expect(parseVerificacion("verificado")).toBe("verificado");
    expect(parseVerificacion("sin_verificar")).toBe("sin_verificar");
  });

  it("cualquier otro valor devuelve undefined (sin filtro)", () => {
    expect(parseVerificacion(undefined)).toBeUndefined();
    expect(parseVerificacion("otra-cosa")).toBeUndefined();
  });
});

describe("filtrosDeTab", () => {
  it("agendado: estado=agendado, resuelto=false", () => {
    expect(filtrosDeTab("agendado", "bruno", undefined, undefined, undefined, undefined)).toEqual({
      estado: "agendado",
      resuelto: false,
      q: "bruno",
      desde: undefined,
      hasta: undefined,
      tipoConsultaId: undefined,
      verificacion: undefined,
    });
  });

  it("resuelto: estado=agendado, resuelto=true", () => {
    const r = filtrosDeTab("resuelto", undefined, undefined, undefined, undefined, undefined);
    expect(r.estado).toBe("agendado");
    expect(r.resuelto).toBe(true);
  });

  it("cancelada: solo estado=cancelada, sin filtro de resuelto", () => {
    const r = filtrosDeTab("cancelada", undefined, undefined, undefined, undefined, undefined);
    expect(r.estado).toBe("cancelada");
    expect(r.resuelto).toBeUndefined();
  });

  it("todas: sin filtro de estado", () => {
    const r = filtrosDeTab("todas", undefined, undefined, undefined, undefined, undefined);
    expect(r.estado).toBeUndefined();
    expect(r.resuelto).toBeUndefined();
  });

  it("desde/hasta se convierten a instantes RFC3339 en zona Córdoba, no quedan como 'YYYY-MM-DD'", () => {
    const r = filtrosDeTab("agendado", undefined, "2030-06-03", "2030-06-05", undefined, undefined);
    expect(r.desde).toMatch(/^2030-06-03T00:00:00/);
    expect(r.hasta).toMatch(/^2030-06-05T23:59:59/);
  });

  it("pasa tipoConsultaId y verificacion sin tocarlos", () => {
    const r = filtrosDeTab("agendado", undefined, undefined, undefined, "tc-1", "verificado");
    expect(r.tipoConsultaId).toBe("tc-1");
    expect(r.verificacion).toBe("verificado");
  });
});

describe("RANGOS_RAPIDOS", () => {
  it("expone Hoy/Semana/Mes en ese orden", () => {
    expect(RANGOS_RAPIDOS.map((r) => r.label)).toEqual(["Hoy", "Semana", "Mes"]);
  });
});
