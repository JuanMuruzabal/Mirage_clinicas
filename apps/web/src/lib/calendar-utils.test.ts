import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diasDeVista,
  endOfMonth,
  formatDiaCorto,
  formatDiaLargo,
  formatHora,
  formatMesAnio,
  formatRangoSemana,
  isSameDay,
  navegar,
  rangoVisible,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "./calendar-utils";

describe("startOfDay", () => {
  it("pone la hora en 00:00:00.000", () => {
    const d = startOfDay(new Date(2026, 8, 15, 14, 30, 45));
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });
});

describe("addDays / addMonths", () => {
  it("suma y resta días correctamente", () => {
    const d = addDays(new Date(2026, 8, 1), 5);
    expect(d.getDate()).toBe(6);
  });

  it("suma meses correctamente", () => {
    const d = addMonths(new Date(2026, 8, 1), 2);
    expect(d.getMonth()).toBe(10); // noviembre (0-indexed)
  });
});

describe("startOfWeek", () => {
  it("un martes retrocede al lunes de esa semana", () => {
    const martes = new Date(2026, 8, 1); // 1 sep 2026 es martes
    const lunes = startOfWeek(martes);
    expect(lunes.getDay()).toBe(1);
    expect(lunes.getDate()).toBe(31); // lunes 31 de agosto
  });

  it("un domingo retrocede al lunes anterior (no se queda en domingo)", () => {
    const domingo = new Date(2026, 8, 6); // domingo
    const lunes = startOfWeek(domingo);
    expect(lunes.getDay()).toBe(1);
    expect(lunes.getDate()).toBe(31);
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("devuelve el primer y último día del mes", () => {
    const d = new Date(2026, 8, 15);
    expect(startOfMonth(d).getDate()).toBe(1);
    expect(endOfMonth(d).getMonth()).toBe(8);
    expect(endOfMonth(d).getDate()).toBe(30); // septiembre tiene 30 días
  });
});

describe("isSameDay", () => {
  it("compara solo año/mes/día, ignora la hora", () => {
    expect(isSameDay(new Date(2026, 8, 1, 9, 0), new Date(2026, 8, 1, 23, 59))).toBe(true);
    expect(isSameDay(new Date(2026, 8, 1), new Date(2026, 8, 2))).toBe(false);
  });
});

describe("formatHora / formatDiaCorto / formatMesAnio / formatDiaLargo / formatRangoSemana", () => {
  it("formatHora da HH:MM en formato 24hs", () => {
    expect(formatHora(new Date(2026, 8, 1, 9, 5))).toBe("09:05");
  });

  it("formatDiaCorto incluye el día abreviado y el número", () => {
    const s = formatDiaCorto(new Date(2026, 8, 1));
    expect(s).toMatch(/\d/);
  });

  it("formatMesAnio arranca en mayúscula", () => {
    const s = formatMesAnio(new Date(2026, 8, 1));
    expect(s[0]).toBe(s[0].toUpperCase());
    expect(s.toLowerCase()).toContain("septiembre");
  });

  it("formatDiaLargo arranca en mayúscula", () => {
    const s = formatDiaLargo(new Date(2026, 8, 1));
    expect(s[0]).toBe(s[0].toUpperCase());
  });

  it("formatRangoSemana no rompe cuando la semana cruza de mes", () => {
    const s = formatRangoSemana(new Date(2026, 8, 1));
    expect(s).toContain("–");
  });
});

describe("rangoVisible", () => {
  it("día: un rango de 24hs", () => {
    const { desde, hasta } = rangoVisible(new Date(2026, 8, 15), "dia");
    expect(hasta.getTime() - desde.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("semana: un rango de 7 días desde el lunes", () => {
    const { desde, hasta } = rangoVisible(new Date(2026, 8, 15), "semana");
    expect(desde.getDay()).toBe(1);
    expect(hasta.getTime() - desde.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("mes: cubre de punta a punta de semana (grilla completa)", () => {
    const { desde, hasta } = rangoVisible(new Date(2026, 8, 15), "mes");
    expect(desde.getDay()).toBe(1);
    expect(hasta.getDay()).toBe(1);
    expect(desde.getTime()).toBeLessThan(new Date(2026, 8, 1).getTime());
    expect(hasta.getTime()).toBeGreaterThan(new Date(2026, 8, 30).getTime());
  });
});

describe("diasDeVista", () => {
  it("día: un solo día", () => {
    expect(diasDeVista(new Date(2026, 8, 15), "dia")).toHaveLength(1);
  });

  it("semana: 7 días", () => {
    expect(diasDeVista(new Date(2026, 8, 15), "semana")).toHaveLength(7);
  });

  it("mes: múltiplo de 7 (semanas completas)", () => {
    const dias = diasDeVista(new Date(2026, 8, 15), "mes");
    expect(dias.length % 7).toBe(0);
    expect(dias.length).toBeGreaterThanOrEqual(28);
  });
});

describe("navegar", () => {
  it("día: mueve 1 día", () => {
    const d = navegar(new Date(2026, 8, 15), "dia", 1);
    expect(d.getDate()).toBe(16);
  });

  it("semana: mueve 7 días", () => {
    const d = navegar(new Date(2026, 8, 15), "semana", -1);
    expect(d.getDate()).toBe(8);
  });

  it("mes: mueve 1 mes", () => {
    const d = navegar(new Date(2026, 8, 15), "mes", 1);
    expect(d.getMonth()).toBe(9);
  });
});
