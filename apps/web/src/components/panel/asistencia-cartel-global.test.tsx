import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Turno, TurnosPendientesAsistenciaResponse } from "@dental-mirage/shared-types";

const { turnosPendientesAsistenciaActionMock, marcarAsistenciaActionMock } = vi.hoisted(() => ({
  turnosPendientesAsistenciaActionMock: vi.fn(),
  marcarAsistenciaActionMock: vi.fn(),
}));
vi.mock("@/app/actions/turnos", () => ({
  turnosPendientesAsistenciaAction: turnosPendientesAsistenciaActionMock,
  marcarAsistenciaAction: marcarAsistenciaActionMock,
}));

const { AsistenciaCartelGlobal } = await import("./asistencia-cartel-global");

// "Ahora" fijo para todo el archivo: 01/09/2030 10:00 (hora de pared,
// TZ ya fijado a America/Argentina/Cordoba en vitest.config.mts).
const AHORA = new Date(2030, 8, 1, 10, 0, 0).getTime();

function turno(overrides: Partial<Turno>): Turno {
  return {
    id: "t-1",
    estado: "agendado",
    origen: "manual",
    tipoConsultaId: "tc-1",
    horaInicio: new Date(2030, 8, 1, 9, 0).toISOString(),
    horaFin: new Date(2030, 8, 1, 9, 30).toISOString(),
    nombreContacto: "Bruno",
    apellidoContacto: "Iglesias",
    dniContacto: "30111222",
    telefonoContacto: "+5493511234567",
    emailContacto: "bruno@example.com",
    motivo: "",
    createdAt: new Date().toISOString(),
    asistencia: null,
    ...overrides,
  };
}

// pendientes — atajo para el shape de turnosPendientesAsistenciaAction:
// el backend ya devuelve `vencidos` ordenado (más antiguo primero) y
// filtrado (sin marcar, ya resueltos) — este componente confía en eso,
// sin volver a ordenar/filtrar del lado del cliente (a diferencia de la
// primera versión, que traía la tabla entera de turnos y filtraba acá).
function pendientes(vencidos: Turno[], proximoVencimiento: string | null = null): TurnosPendientesAsistenciaResponse {
  return { vencidos, proximoVencimiento };
}

describe("AsistenciaCartelGlobal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // shouldAdvanceTime: true — el reloj fake avanza solo con el tiempo
    // real de pared, así que el polling interno de waitFor/findBy de RTL
    // (setTimeout real) sigue funcionando sin tocar nada; los avances
    // manuales (vi.advanceTimersByTimeAsync) siguen saltando el reloj
    // hacia adelante además de eso, para las pruebas de "mantener
    // apretado 10 segundos" sin esperar 10 segundos de verdad.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no muestra nada si no hay turnos pendientes de asistencia", async () => {
    turnosPendientesAsistenciaActionMock.mockResolvedValue(pendientes([]));
    render(<AsistenciaCartelGlobal />);

    await waitFor(() => expect(turnosPendientesAsistenciaActionMock).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("muestra el cartel del primer turno de la cola (el backend ya lo ordena, más antiguo primero)", async () => {
    vi.setSystemTime(AHORA);
    turnosPendientesAsistenciaActionMock.mockResolvedValue(
      pendientes([
        turno({ id: "mas-viejo", nombreContacto: "Ana", apellidoContacto: "Vieja" }),
        turno({ id: "mas-nuevo", nombreContacto: "Carla", apellidoContacto: "Nuevo" }),
      ]),
    );
    render(<AsistenciaCartelGlobal />);

    expect(await screen.findByText("Ana Vieja")).toBeInTheDocument();
    expect(screen.queryByText("Carla Nuevo")).not.toBeInTheDocument();
  });

  it("no tiene botón de cerrar ni forma de descartarlo sin responder", async () => {
    vi.setSystemTime(AHORA);
    turnosPendientesAsistenciaActionMock.mockResolvedValue(pendientes([turno({})]));
    render(<AsistenciaCartelGlobal />);

    await screen.findByRole("alertdialog");
    expect(screen.queryByRole("button", { name: "Cerrar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cerrar")).not.toBeInTheDocument();
  });

  it("mantener apretado ASISTIÓ menos de 10 segundos no confirma nada", async () => {
    vi.setSystemTime(AHORA);
    turnosPendientesAsistenciaActionMock.mockResolvedValue(pendientes([turno({})]));
    render(<AsistenciaCartelGlobal />);
    const boton = await screen.findByRole("button", { name: "Asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    fireEvent.pointerUp(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  // Bug real reportado por el cliente, 2026-09-05: "toco 10 seg pero no
  // se completa" — el cursor se salía del botón sin soltar el mouse
  // (temblor de mano normal durante 10 segundos reales) y eso cancelaba
  // todo en silencio. Con `setPointerCapture` (pointerdown), alejarse del
  // botón ya no debe interrumpir la espera — solo soltar (pointerup) o un
  // pointercancel real.
  it("alejar el cursor del botón sin soltarlo NO cancela la espera (setPointerCapture)", async () => {
    vi.setSystemTime(AHORA);
    const t = turno({ id: "t-no-se-cancela" });
    turnosPendientesAsistenciaActionMock.mockResolvedValueOnce(pendientes([t])).mockResolvedValue(pendientes([]));
    render(<AsistenciaCartelGlobal />);
    const boton = await screen.findByRole("button", { name: "Asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    fireEvent.pointerLeave(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });

    expect(marcarAsistenciaActionMock).toHaveBeenCalledWith("t-no-se-cancela", "asistio");
  });

  it("mantener apretado ASISTIÓ 10 segundos completos confirma y saca el cartel", async () => {
    vi.setSystemTime(AHORA);
    const t = turno({ id: "t-asistio" });
    turnosPendientesAsistenciaActionMock.mockResolvedValueOnce(pendientes([t])).mockResolvedValue(pendientes([]));
    render(<AsistenciaCartelGlobal />);
    const boton = await screen.findByRole("button", { name: "Asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(marcarAsistenciaActionMock).toHaveBeenCalledWith("t-asistio", "asistio");
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("mantener apretado NO ASISTIÓ 10 segundos completos confirma con 'ausente'", async () => {
    vi.setSystemTime(AHORA);
    const t = turno({ id: "t-ausente" });
    turnosPendientesAsistenciaActionMock.mockResolvedValueOnce(pendientes([t])).mockResolvedValue(pendientes([]));
    render(<AsistenciaCartelGlobal />);
    const boton = await screen.findByRole("button", { name: "No asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(marcarAsistenciaActionMock).toHaveBeenCalledWith("t-ausente", "ausente");
  });

  it("soltar y volver a apretar reinicia el progreso desde cero", async () => {
    vi.setSystemTime(AHORA);
    turnosPendientesAsistenciaActionMock.mockResolvedValue(pendientes([turno({})]));
    render(<AsistenciaCartelGlobal />);
    const boton = await screen.findByRole("button", { name: "Asistió" });

    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    fireEvent.pointerUp(boton);
    fireEvent.pointerDown(boton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });

    // 9s de vuelta después de soltar y re-apretar: si no hubiera
    // reiniciado, ya habría pasado los 10s acumulados y confirmado.
    expect(marcarAsistenciaActionMock).not.toHaveBeenCalled();
  });

  it("programa un timer preciso para el próximo vencimiento y vuelve a sondear en ese momento", async () => {
    vi.setSystemTime(AHORA);
    turnosPendientesAsistenciaActionMock
      .mockResolvedValueOnce(pendientes([], new Date(AHORA + 5_000).toISOString()))
      .mockResolvedValue(pendientes([turno({ id: "recien-vencido" })]));
    render(<AsistenciaCartelGlobal />);

    await waitFor(() => expect(turnosPendientesAsistenciaActionMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });

    expect(turnosPendientesAsistenciaActionMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });
});
