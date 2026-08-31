import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diasDeVista,
  endOfMonth,
  fechaISOLocal,
  formatDiaCorto,
  formatDiaLargo,
  formatHora,
  formatMesAnio,
  formatRangoSemana,
  horaISOLocal,
  hoyEnCordoba,
  isSameDay,
  minutosDesdeMedianocheCordoba,
  navegar,
  rangoVisible,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "./calendar-utils";

// hoyEnCordoba — encontrado investigando un error de hidratación de
// React (2026-08-30): sus campos LOCALES (los que lee el resto de este
// archivo: getFullYear/getMonth/getDate) tienen que coincidir con el día
// de Córdoba SEA CUAL SEA la timezone ambiente de quien lo ejecuta — el
// test real de esto (que la timezone ambiente no importa) vive en Go, no
// acá: Vitest corre en un solo proceso con una sola timezone ambiente por
// corrida, así que "mockear otra timezone" para probarlo de verdad
// requeriría reiniciar el proceso. Lo que sí se puede afirmar sin
// mockear nada: sus campos locales coinciden con los que arma
// `Intl.DateTimeFormat` pidiendo explícitamente America/Argentina/Cordoba
// para "ahora" — si esto se rompe, se rompe también el propio cálculo
// que usa la función.
describe("hoyEnCordoba", () => {
  it("sus campos locales coinciden con 'ahora' en America/Argentina/Cordoba", () => {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Cordoba",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value;

    const hoy = hoyEnCordoba();
    expect(hoy.getFullYear()).toBe(Number(parte("year")));
    expect(hoy.getMonth() + 1).toBe(Number(parte("month")));
    expect(hoy.getDate()).toBe(Number(parte("day")));
  });
});

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
  // formatHora recibe INSTANTES de verdad (horaInicio/horaFin de un
  // turno) y los convierte siempre a hora de Córdoba (ver el comentario
  // de TIMEZONE_CORDOBA en calendar-utils.ts) — el input se construye acá
  // vía Date.UTC a propósito, para que el test no dependa de en qué
  // timezone corre la máquina que lo ejecuta (a diferencia de `new
  // Date(2026, 8, 1, 9, 5)`, que "vale" 09:05 en la timezone AMBIENTE del
  // runner, no necesariamente en Córdoba). Córdoba es UTC-3 todo el año
  // (sin horario de verano) — 12:05 UTC son 09:05 en Córdoba.
  it("formatHora da HH:MM en formato 24hs, hora de Córdoba (UTC-3)", () => {
    expect(formatHora(new Date(Date.UTC(2026, 8, 1, 12, 5)))).toBe("09:05");
  });

  // minutosDesdeMedianocheCordoba — bug real reportado por el cliente,
  // 2026-08-30: calendar-grid.tsx usaba `.getHours()/.getMinutes()`
  // directo para ubicar verticalmente cada turno, y esos getters son
  // LOCALES — al refrescar la página (SSR en el server, timezone UTC),
  // los turnos aparecían corridos ~3 horas de su lugar. Mismo criterio
  // que el test de formatHora de arriba: input armado vía Date.UTC para
  // no depender de la timezone de la máquina que corre el test.
  it("minutosDesdeMedianocheCordoba da los minutos desde medianoche en Córdoba (UTC-3)", () => {
    // 12:05 UTC = 09:05 en Córdoba = 9*60+5 = 545 minutos.
    expect(minutosDesdeMedianocheCordoba(new Date(Date.UTC(2026, 8, 1, 12, 5)))).toBe(9 * 60 + 5);
  });

  it("minutosDesdeMedianocheCordoba: la medianoche de Córdoba da 0, no 1440", () => {
    // 03:00 UTC = 00:00 en Córdoba.
    expect(minutosDesdeMedianocheCordoba(new Date(Date.UTC(2026, 8, 1, 3, 0)))).toBe(0);
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

// TR-074 en docs/tradeoffs.md — reemplazan `d.toISOString().slice(...)`
// (fecha/hora en UTC) en agregar-turno-modal.tsx/editar-turno-modal.tsx:
// esa versión se adelantaba un día en Argentina (UTC-3) durante las
// últimas horas del día local, dejando que se ingresaran horas ya
// pasadas HOY sin que la validación las detectara.
describe("fechaISOLocal", () => {
  it("da YYYY-MM-DD con cero-relleno, en la fecha LOCAL (no UTC)", () => {
    expect(fechaISOLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(fechaISOLocal(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("horaISOLocal", () => {
  it("da HH:MM con cero-relleno, en la hora LOCAL (no UTC)", () => {
    expect(horaISOLocal(new Date(2026, 0, 1, 9, 5))).toBe("09:05");
    expect(horaISOLocal(new Date(2026, 0, 1, 23, 0))).toBe("23:00");
  });
});
