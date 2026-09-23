import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { HorariosClinicaVista } from "@dental-mirage/prisma-engine";

const { useAhoraMock } = vi.hoisted(() => ({ useAhoraMock: vi.fn() }));
vi.mock("@/lib/reloj", () => ({ useAhora: useAhoraMock }));

const { EstadoHorarioActual } = await import("./estado-horario-actual");

const horarios: HorariosClinicaVista = {
  dias: [{ diaSemana: 1, cerrado: false, franjas: [{ desde: "09:00", hasta: "10:00" }] }],
  nota: "",
  abiertoAhora: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EstadoHorarioActual", () => {
  it.each([
    [true, "Abierto ahora"],
    [false, "Cerrado ahora"],
  ])("usa el estado del servidor mientras el reloj aún no está disponible (%s)", (abierto, etiqueta) => {
    useAhoraMock.mockReturnValue(null);

    render(<EstadoHorarioActual horarios={{ ...horarios, abiertoAhora: abierto }} />);

    expect(screen.getByText(etiqueta)).toBeInTheDocument();
    expect(useAhoraMock).toHaveBeenCalledWith(30_000);
  });

  it("calcula la apertura con la hora de Córdoba y cuenta la apertura como inclusiva", () => {
    // 12:15 UTC equivale a las 09:15 del lunes en Córdoba.
    useAhoraMock.mockReturnValue(Date.parse("2026-09-21T12:15:00.000Z"));

    render(<EstadoHorarioActual horarios={horarios} />);

    expect(screen.getByText("Abierto ahora")).toBeInTheDocument();
  });

  it("considera cerrada la franja al llegar a la hora de cierre", () => {
    // 13:00 UTC equivale a las 10:00 del lunes en Córdoba.
    useAhoraMock.mockReturnValue(Date.parse("2026-09-21T13:00:00.000Z"));

    render(<EstadoHorarioActual horarios={{ ...horarios, abiertoAhora: true }} />);

    expect(screen.getByText("Cerrado ahora")).toBeInTheDocument();
  });

  it("marca cerrado si el día no está configurado o está cerrado", () => {
    useAhoraMock.mockReturnValue(Date.parse("2026-09-21T12:15:00.000Z"));

    const sinDia = render(<EstadoHorarioActual horarios={{ ...horarios, dias: [], abiertoAhora: true }} />);
    expect(screen.getByText("Cerrado ahora")).toBeInTheDocument();
    sinDia.unmount();

    render(<EstadoHorarioActual horarios={{
      ...horarios,
      dias: [{ diaSemana: 1, cerrado: true, franjas: [{ desde: "09:00", hasta: "10:00" }] }],
      abiertoAhora: true,
    }} />);
    expect(screen.getByText("Cerrado ahora")).toBeInTheDocument();
  });

  it("revisa las dos franjas y abre si la hora cae en la segunda", () => {
    useAhoraMock.mockReturnValue(Date.parse("2026-09-21T12:45:00.000Z"));

    render(<EstadoHorarioActual horarios={{
      ...horarios,
      dias: [{
        diaSemana: 1,
        cerrado: false,
        franjas: [
          { desde: "08:00", hasta: "08:30" },
          { desde: "09:00", hasta: "10:00" },
        ],
      }],
    }} />);

    expect(screen.getByText("Abierto ahora")).toBeInTheDocument();
  });
});
