import { describe, expect, it } from "vitest";
import {
  ESTADO_DERIVADO_LABEL,
  ESTADO_LABEL,
  estadoDeTurno,
  formatFechaHora,
  temaTipoConsulta,
} from "./turno-format";

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

// estadoDeTurno — el estado que VE el profesional, derivado del reloj
// (2026-09-19). La base guarda dos valores; la pantalla dice cuatro.
describe("estadoDeTurno", () => {
  const T0 = new Date("2026-09-19T14:00:00.000Z").getTime();
  const enHoras = (h: number) => new Date(T0 + h * 3600_000).toISOString();

  it("antes de empezar es pendiente", () => {
    expect(estadoDeTurno({ estado: "agendado", horaInicio: enHoras(1), horaFin: enHoras(2) }, T0)).toBe("pendiente");
  });

  // El estado nuevo, y la razón de todo esto: dentro de su horario, el
  // turno está pasando ahora.
  it("adentro de su horario es en_proceso", () => {
    expect(estadoDeTurno({ estado: "agendado", horaInicio: enHoras(-1), horaFin: enHoras(1) }, T0)).toBe("en_proceso");
  });

  it("en el instante exacto del comienzo ya es en_proceso, no pendiente", () => {
    expect(estadoDeTurno({ estado: "agendado", horaInicio: enHoras(0), horaFin: enHoras(1) }, T0)).toBe("en_proceso");
  });

  it("pasada la hora de fin es resuelto", () => {
    expect(estadoDeTurno({ estado: "agendado", horaInicio: enHoras(-2), horaFin: enHoras(-1) }, T0)).toBe("resuelto");
  });

  // El borde entre en_proceso y resuelto: al cumplirse la hora de fin el
  // turno ya terminó. Es el mismo instante en que dispara el cartel de
  // asistencia, así que las dos cosas no pueden discrepar.
  it("en el instante exacto del fin ya es resuelto", () => {
    expect(estadoDeTurno({ estado: "agendado", horaInicio: enHoras(-1), horaFin: enHoras(0) }, T0)).toBe("resuelto");
  });

  // Cancelada es el único que sí es un valor guardado, y gana sobre el
  // reloj: un turno cancelado no pasa a "en proceso" porque llegó su
  // hora.
  it("cancelada manda sobre el reloj", () => {
    expect(estadoDeTurno({ estado: "cancelada", horaInicio: enHoras(-1), horaFin: enHoras(1) }, T0)).toBe("cancelada");
  });

  it("sin horarios cae en pendiente en vez de romperse", () => {
    expect(estadoDeTurno({ estado: "agendado", horaInicio: undefined, horaFin: undefined }, T0)).toBe("pendiente");
  });
});

describe("rótulos de estado", () => {
  // 2026-09-19, pedido del cliente: "el estado confirmado pasa a
  // llamarse pendiente". El valor de la base sigue siendo `agendado`.
  it("un turno agendado se rotula Pendiente, no Confirmado", () => {
    expect(ESTADO_LABEL.agendado).toBe("Pendiente");
    expect(ESTADO_DERIVADO_LABEL.pendiente).toBe("Pendiente");
  });

  it("el estado nuevo se rotula En proceso", () => {
    expect(ESTADO_DERIVADO_LABEL.en_proceso).toBe("En proceso");
  });
});
