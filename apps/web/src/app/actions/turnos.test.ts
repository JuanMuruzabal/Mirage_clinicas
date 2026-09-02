import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  redirectMock,
  revalidatePathMock,
  apiListTurnosMock,
  apiCrearTurnoManualMock,
  apiCancelarTurnoMock,
  apiReprogramarTurnoMock,
  apiAutoreservarTurnosMock,
  getSessionTokenMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  apiListTurnosMock: vi.fn(),
  apiCrearTurnoManualMock: vi.fn(),
  apiCancelarTurnoMock: vi.fn(),
  apiReprogramarTurnoMock: vi.fn(),
  apiAutoreservarTurnosMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/api", () => ({
  apiListTurnos: apiListTurnosMock,
  apiCrearTurnoManual: apiCrearTurnoManualMock,
  apiCancelarTurno: apiCancelarTurnoMock,
  apiReprogramarTurno: apiReprogramarTurnoMock,
  apiAutoreservarTurnos: apiAutoreservarTurnosMock,
}));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { listTurnosAction, crearTurnoManualAction, cancelarTurnoAction, reprogramarTurnoAction, autoreservarTurnosAction } = await import(
  "./turnos"
);

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

const payloadNuevo = {
  nombreContacto: "María",
  apellidoContacto: "Games",
  dniContacto: "1",
  telefonoContacto: "1",
  tipoConsultaId: "tc-1",
  horaInicio: "2026-09-01T09:00:00Z",
  horaFin: "2026-09-01T09:30:00Z",
};

describe("listTurnosAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(listTurnosAction({})).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("devuelve la lista en éxito", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiListTurnosMock.mockResolvedValue({ ok: true, data: [{ id: "1" }] });

    await expect(listTurnosAction({ estado: "agendado" })).resolves.toEqual([{ id: "1" }]);
  });

  it("devuelve [] si la API falla (no rompe el calendario)", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiListTurnosMock.mockResolvedValue({ ok: false, status: 500, error: "error" });

    await expect(listTurnosAction({})).resolves.toEqual([]);
  });
});

describe("crearTurnoManualAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(crearTurnoManualAction(payloadNuevo)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida el panel y devuelve el turno", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiCrearTurnoManualMock.mockResolvedValue({ ok: true, data: { id: "1", estado: "agendado" } });

    const result = await crearTurnoManualAction(payloadNuevo);

    expect(result).toEqual({ turno: { id: "1", estado: "agendado" } });
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel");
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error (T2.5: solapamiento), devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiCrearTurnoManualMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "ese horario se superpone con otro turno ya agendado",
    });

    const result = await crearTurnoManualAction(payloadNuevo);

    expect(result).toEqual({ error: "ese horario se superpone con otro turno ya agendado" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("cancelarTurnoAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(cancelarTurnoAction("turno-1")).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida turnos/calendario/panel y devuelve el turno", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiCancelarTurnoMock.mockResolvedValue({ ok: true, data: { id: "turno-1", estado: "cancelada" } });

    const result = await cancelarTurnoAction("turno-1");

    expect(result).toEqual({ turno: { id: "turno-1", estado: "cancelada" } });
    expect(apiCancelarTurnoMock).toHaveBeenCalledWith("un-jwt", "turno-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/turnos");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiCancelarTurnoMock.mockResolvedValue({ ok: false, status: 404, error: "turno no encontrado" });

    const result = await cancelarTurnoAction("turno-1");

    expect(result).toEqual({ error: "turno no encontrado" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("reprogramarTurnoAction", () => {
  const payloadHora = { horaInicio: "2026-09-01T09:00:00Z", horaFin: "2026-09-01T09:30:00Z" };

  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(reprogramarTurnoAction("turno-1", payloadHora)).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida turnos/calendario/panel y devuelve el turno", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiReprogramarTurnoMock.mockResolvedValue({ ok: true, data: { id: "turno-1", horaInicio: payloadHora.horaInicio } });

    const result = await reprogramarTurnoAction("turno-1", payloadHora);

    expect(result).toEqual({ turno: { id: "turno-1", horaInicio: payloadHora.horaInicio } });
    expect(apiReprogramarTurnoMock).toHaveBeenCalledWith("un-jwt", "turno-1", payloadHora);
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/turnos");
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error (T2.5: solapamiento), devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiReprogramarTurnoMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "ese horario se superpone con otro turno ya agendado",
    });

    const result = await reprogramarTurnoAction("turno-1", payloadHora);

    expect(result).toEqual({ error: "ese horario se superpone con otro turno ya agendado" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("autoreservarTurnosAction", () => {
  it("redirige a /ingresar sin sesión", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    await expect(autoreservarTurnosAction(["turno-1"])).rejects.toThrow("NEXT_REDIRECT:/ingresar");
  });

  it("en éxito, revalida turnos/calendario/panel y devuelve los resultados", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    const resultados = {
      resultados: [
        {
          turnoId: "turno-1",
          nombre: "María Games",
          horaInicioAnterior: "2026-09-01T09:00:00Z",
          horaFinAnterior: "2026-09-01T09:30:00Z",
          horaInicioNueva: "2026-09-02T09:00:00Z",
          horaFinNueva: "2026-09-02T09:30:00Z",
          reprogramado: true,
        },
      ],
    };
    apiAutoreservarTurnosMock.mockResolvedValue({ ok: true, data: resultados });

    const result = await autoreservarTurnosAction(["turno-1"]);

    expect(result).toEqual(resultados);
    expect(apiAutoreservarTurnosMock).toHaveBeenCalledWith("un-jwt", ["turno-1"]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/panel/calendario");
  });

  it("en error, devuelve el mensaje sin revalidar", async () => {
    getSessionTokenMock.mockResolvedValue("un-jwt");
    apiAutoreservarTurnosMock.mockResolvedValue({ ok: false, status: 409, error: "solo se pueden autoreservar turnos confirmados" });

    const result = await autoreservarTurnosAction(["turno-1"]);

    expect(result).toEqual({ error: "solo se pueden autoreservar turnos confirmados" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
