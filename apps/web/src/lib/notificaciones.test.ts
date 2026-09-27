import { describe, expect, it } from "vitest";
import type { Notificacion } from "@dental-mirage/shared-types";
import {
  claveDeServidorEnBytes,
  destinoDeApertura,
  fechaLarga,
  haceCuanto,
  hora,
  numeroDeLaCampana,
  principalDe,
  rangoHorario,
  resumenDe,
  selloDeFecha,
  tituloDe,
} from "./notificaciones";

const turno: Notificacion = {
  id: "n-1",
  tipo: "turno_nuevo",
  creadaEn: "2026-09-26T13:00:00Z",
  leidaEn: null,
  clinicaId: "c-1",
  turnoId: "t-1",
  datos: {
    pacienteNombre: "Bruno Iglesias",
    clinicaNombre: "Clínica Norte",
    horaInicio: "2026-10-05T10:00:00-03:00",
    horaFin: "2026-10-05T10:30:00-03:00",
  },
};

describe("fechas del turno, siempre en la hora de Córdoba", () => {
  it("fecha larga, hora y rango", () => {
    expect(fechaLarga(turno.datos.horaInicio)).toBe("lunes 5 de octubre");
    expect(hora(turno.datos.horaInicio)).toBe("10:00");
    expect(rangoHorario(turno.datos.horaInicio, turno.datos.horaFin)).toBe("10:00 a 10:30");
    expect(rangoHorario(turno.datos.horaInicio, undefined)).toBe("10:00");
    expect(rangoHorario(undefined, undefined)).toBe("");
  });

  it("un instante UTC que en Córdoba es el día anterior se muestra en el día de Córdoba", () => {
    // 01:30 UTC del 6 = 22:30 del 5 en Córdoba.
    expect(fechaLarga("2026-10-06T01:30:00Z")).toBe("lunes 5 de octubre");
    expect(hora("2026-10-06T01:30:00Z")).toBe("22:30");
  });

  it("el sello: día de la semana, número y mes, sin puntos", () => {
    expect(selloDeFecha(turno.datos.horaInicio)).toEqual({ diaSemana: "LUN", dia: "5", mes: "OCT" });
    expect(selloDeFecha(undefined)).toBeNull();
    expect(selloDeFecha("no es una fecha")).toBeNull();
  });
});

describe("haceCuanto", () => {
  const llegada = "2026-09-26T13:00:00Z";
  const base = new Date(llegada).getTime();
  it.each([
    [0, "Recién"],
    [5 * 60_000, "Hace 5 min"],
    [3 * 3_600_000, "Hace 3 h"],
    [30 * 3_600_000, "Ayer"],
  ])("después de %i ms: %s", (ms, esperado) => {
    expect(haceCuanto(llegada, base + ms)).toBe(esperado);
  });
  it("más de dos días: la fecha corta", () => {
    expect(haceCuanto(llegada, base + 5 * 86_400_000)).toBe("26 sept");
  });
});

describe("el número de la campana", () => {
  it.each([
    [0, ""],
    [1, "1"],
    [9, "9"],
    [10, "9+"],
    [250, "9+"],
  ])("%i nuevas → %s", (n, esperado) => {
    expect(numeroDeLaCampana(n)).toBe(esperado);
  });
});

describe("títulos", () => {
  it("un turno dice quién, a qué hora y de qué clínica sin abrirlo", () => {
    expect(tituloDe(turno)).toBe("Turno nuevo");
    expect(principalDe(turno)).toBe("Bruno Iglesias");
    expect(resumenDe(turno)).toBe("10:00 · Clínica Norte");
  });
  it("la bienvenida: la firma de la marca como rótulo y el saludo en una línea", () => {
    const bienvenida: Notificacion = { ...turno, tipo: "bienvenida", datos: {} };
    expect(tituloDe(bienvenida)).toBe("PRISMA");
    expect(principalDe(bienvenida)).toBe("Te damos la bienvenida");
    expect(resumenDe(bienvenida)).toBeTruthy();
  });
});

describe("destinoDeApertura — adónde lleva 'Ver turno'", () => {
  const base = { tipo: "turno_nuevo" as const, cambioDeClinica: false, sinAcceso: false };

  it("un turno vigente: el calendario de ese día con el detalle abierto", () => {
    expect(destinoDeApertura({ ...base, turnoId: "t-1", estadoTurno: "agendado", fecha: "2026-10-05" })).toBe(
      "/panel/calendario?vista=dia&fecha=2026-10-05&turno=t-1",
    );
  });
  it("uno cancelado: la lista de canceladas con esa fila abierta", () => {
    expect(destinoDeApertura({ ...base, turnoId: "t-1", estadoTurno: "cancelada" })).toBe(
      "/panel/turnos?estado=cancelada&turno=t-1",
    );
  });
  it("uno que ya no existe: el calendario de hoy", () => {
    expect(destinoDeApertura({ ...base, turnoId: "t-1" })).toBe("/panel/calendario?vista=dia");
  });
  it("sin acceso a esa clínica: la elección de clínica", () => {
    expect(destinoDeApertura({ ...base, turnoId: "t-1", sinAcceso: true })).toBe("/clinicas");
  });
  it("la bienvenida no lleva a ningún lado", () => {
    expect(destinoDeApertura({ ...base, tipo: "bienvenida" })).toBeNull();
  });
});

it("claveDeServidorEnBytes decodifica base64url (con o sin relleno)", () => {
  expect(Array.from(claveDeServidorEnBytes("AQID"))).toEqual([1, 2, 3]);
  expect(Array.from(claveDeServidorEnBytes("-_8"))).toEqual([251, 255]);
});
