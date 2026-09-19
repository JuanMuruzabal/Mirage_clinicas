import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ResumenTurnoItem } from "@dental-mirage/shared-types";

const marcarAsistenciaActionMock = vi.fn();
vi.mock("@/app/actions/turnos", () => ({
  marcarAsistenciaAction: (...args: unknown[]) => marcarAsistenciaActionMock(...args),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const { TarjetaTurnosDeHoy, textoRestantes } = await import("./tarjeta-turnos-de-hoy");

// El reloj de los tests. Todas las horas de los fixtures se arman
// relativas a este instante, así el resultado no depende de cuándo se
// corre la suite.
const AHORA = new Date("2026-09-19T14:00:00.000Z").getTime();
const enMinutos = (m: number) => new Date(AHORA + m * 60_000).toISOString();

function turno(over: Partial<ResumenTurnoItem> = {}): ResumenTurnoItem {
  return {
    id: "t1",
    fecha: "2026-09-19",
    hora: "12:00",
    horaFin: "12:30",
    nombre: "Juan Paciente",
    horaInicioIso: enMinutos(60),
    horaFinIso: enMinutos(90),
    ...over,
  };
}

function montar(turnos: ResumenTurnoItem[]) {
  return render(<TarjetaTurnosDeHoy turnos={turnos} hrefCabecera="/panel/calendario?vista=dia" />);
}

beforeEach(() => {
  marcarAsistenciaActionMock.mockReset();
  marcarAsistenciaActionMock.mockResolvedValue({});
  refreshMock.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(AHORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TarjetaTurnosDeHoy — el estado sale del reloj", () => {
  it("un turno que todavía no empezó se muestra PENDIENTE", () => {
    montar([turno()]);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
  });

  // El estado nuevo de esta ronda: estamos dentro de su horario.
  it("un turno que está transcurriendo se muestra EN PROCESO", () => {
    montar([turno({ horaInicioIso: enMinutos(-10), horaFinIso: enMinutos(20) })]);
    expect(screen.getByText("En proceso")).toBeInTheDocument();
    expect(screen.queryByText("Pendiente")).not.toBeInTheDocument();
  });

  // Lo que hace que la tarjeta sirva de verdad: la fila cambia sola en
  // la pantalla que ya está abierta, sin que nadie refresque.
  it("pasa de PENDIENTE a EN PROCESO sola, al llegar la hora", async () => {
    montar([turno({ horaInicioIso: enMinutos(1), horaFinIso: enMinutos(31) })]);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(screen.getByText("En proceso")).toBeInTheDocument();
  });
});

describe("TarjetaTurnosDeHoy — los botones de asistencia", () => {
  // "Estos botones aparecerán solo 5 min antes de la hora de comienzo
  // del turno" (pedido textual). El backend impone lo mismo: si esto se
  // adelantara, los botones aparecerían solo para que el servidor los
  // rechace.
  it("no aparecen faltando más de 5 minutos", () => {
    montar([turno({ horaInicioIso: enMinutos(6), horaFinIso: enMinutos(36) })]);
    expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No asistió" })).not.toBeInTheDocument();
  });

  it("aparecen faltando menos de 5 minutos, antes de que el turno empiece", () => {
    montar([turno({ horaInicioIso: enMinutos(3), horaFinIso: enMinutos(33) })]);
    expect(screen.getByRole("button", { name: "Asistió" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No asistió" })).toBeInTheDocument();
  });

  it("aparecen solos al entrar en la ventana, sin refrescar", async () => {
    montar([turno({ horaInicioIso: enMinutos(6), horaFinIso: enMinutos(36) })]);
    expect(screen.queryByRole("button", { name: "Asistió" })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    expect(screen.getByRole("button", { name: "Asistió" })).toBeInTheDocument();
  });

  // Mismo gesto que el cartel del final del turno, y el mismo umbral:
  // son la misma acción irreversible.
  it("mantener apretado 5 segundos marca la asistencia y vuelve a pedir la pantalla", async () => {
    montar([turno({ id: "t-asistio", horaInicioIso: enMinutos(1), horaFinIso: enMinutos(31) })]);
    const boton = screen.getByRole("button", { name: "Asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(marcarAsistenciaActionMock).toHaveBeenCalledWith("t-asistio", "asistio");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("soltar antes de los 5 segundos no marca nada", async () => {
    montar([turno({ horaInicioIso: enMinutos(1), horaFinIso: enMinutos(31) })]);
    const boton = screen.getByRole("button", { name: "No asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    fireEvent.pointerUp(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
  });

  // El rechazo más común es un conflicto de identidad sin resolver. Sin
  // esto el botón se llena, no pasa nada, y no hay forma de saber por
  // qué — el mismo modo de falla que el cartel ya tuvo una vez.
  it("si el backend rechaza, muestra el motivo en la fila", async () => {
    marcarAsistenciaActionMock.mockResolvedValue({
      error: "hay un conflicto de identidad sin resolver con este paciente",
    });
    montar([turno({ horaInicioIso: enMinutos(1), horaFinIso: enMinutos(31) })]);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Asistió" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("conflicto de identidad sin resolver");
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("TarjetaTurnosDeHoy — el pie", () => {
  // "Quedan N turnos más hoy" cuenta los que TODAVÍA NO EMPEZARON: el
  // que está en proceso no es uno "más", es el de ahora.
  it("no cuenta el turno que está en proceso", () => {
    montar([
      turno({ id: "a", horaInicioIso: enMinutos(-5), horaFinIso: enMinutos(25) }),
      turno({ id: "b", horaInicioIso: enMinutos(60), horaFinIso: enMinutos(90) }),
      turno({ id: "c", horaInicioIso: enMinutos(120), horaFinIso: enMinutos(150) }),
    ]);
    expect(screen.getByText("Quedan 2 turnos más hoy.")).toBeInTheDocument();
  });

  it("el número grande cuenta TODOS los turnos del día, no solo los que faltan", () => {
    montar([
      turno({ id: "a", horaInicioIso: enMinutos(-5), horaFinIso: enMinutos(25) }),
      turno({ id: "b", horaInicioIso: enMinutos(60), horaFinIso: enMinutos(90) }),
    ]);
    // Dos turnos arriba, uno "más" abajo: el número es el día entero, el
    // pie es lo que falta. Que digan distinto es correcto.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("turnos agendados")).toBeInTheDocument();
    expect(screen.getByText("Queda 1 turno más hoy.")).toBeInTheDocument();
  });

  it("sin turnos lo dice, en vez de dejar el cuerpo vacío", () => {
    montar([]);
    expect(screen.getByText("No hay turnos para hoy.")).toBeInTheDocument();
    expect(screen.getByText("No queda ningún turno más hoy.")).toBeInTheDocument();
  });
});

describe("textoRestantes", () => {
  it("concuerda en singular y plural", () => {
    expect(textoRestantes(0)).toBe("No queda ningún turno más hoy.");
    expect(textoRestantes(1)).toBe("Queda 1 turno más hoy.");
    expect(textoRestantes(4)).toBe("Quedan 4 turnos más hoy.");
  });
});
