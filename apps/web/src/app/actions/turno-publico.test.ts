import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  apiSolicitarTurnoPublicoMock,
  apiListTiposConsultaPublicoMock,
  apiListDisponibilidadPublicaMock,
  apiEnviarVerificacionTurnoPublicoMock,
  apiConfirmarVerificacionTurnoPublicoMock,
} = vi.hoisted(() => ({
  apiSolicitarTurnoPublicoMock: vi.fn(),
  apiListTiposConsultaPublicoMock: vi.fn(),
  apiListDisponibilidadPublicaMock: vi.fn(),
  apiEnviarVerificacionTurnoPublicoMock: vi.fn(),
  apiConfirmarVerificacionTurnoPublicoMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiSolicitarTurnoPublico: apiSolicitarTurnoPublicoMock,
  apiListTiposConsultaPublico: apiListTiposConsultaPublicoMock,
  apiListDisponibilidadPublica: apiListDisponibilidadPublicaMock,
  apiEnviarVerificacionTurnoPublico: apiEnviarVerificacionTurnoPublicoMock,
  apiConfirmarVerificacionTurnoPublico: apiConfirmarVerificacionTurnoPublicoMock,
}));

const {
  solicitarTurnoPublicoAction,
  listTiposConsultaPublicoAction,
  listDisponibilidadPublicaAction,
  enviarVerificacionEmailAction,
  confirmarVerificacionEmailAction,
} = await import("./turno-publico");

beforeEach(() => {
  vi.clearAllMocks();
});

const payload = {
  nombreContacto: "Bruno",
  apellidoContacto: "Iglesias",
  dniContacto: "30111222",
  telefonoContacto: "+5493511234567",
  emailContacto: "bruno@example.com",
  motivo: "Dolor de muela",
  tipoConsultaId: "tc-1",
  fecha: "2030-06-03",
  hora: "10:00",
  verificacionToken: "token-de-prueba",
};

describe("solicitarTurnoPublicoAction", () => {
  it("en éxito, devuelve id/horaInicio/horaFin del turno creado", async () => {
    apiSolicitarTurnoPublicoMock.mockResolvedValue({
      ok: true,
      data: { id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" },
    });

    const result = await solicitarTurnoPublicoAction("clinica-x", payload);

    expect(result).toEqual({ id: "turno-1", horaInicio: "2030-06-03T10:00:00-03:00", horaFin: "2030-06-03T10:30:00-03:00" });
    expect(apiSolicitarTurnoPublicoMock).toHaveBeenCalledWith("clinica-x", payload);
  });

  it("en error (p. ej. horario ya no disponible), devuelve el mensaje", async () => {
    apiSolicitarTurnoPublicoMock.mockResolvedValue({
      ok: false,
      status: 409,
      error: "ese horario ya no está disponible, elegí otro",
    });

    const result = await solicitarTurnoPublicoAction("clinica-x", payload);

    expect(result).toEqual({ error: "ese horario ya no está disponible, elegí otro" });
  });
});

describe("listTiposConsultaPublicoAction", () => {
  it("devuelve la lista en éxito", async () => {
    const tipos = [{ id: "tc-1", nombre: "Consulta general", color: "#E7D9BE", duracionMinutos: 30 }];
    apiListTiposConsultaPublicoMock.mockResolvedValue({ ok: true, data: tipos });

    const result = await listTiposConsultaPublicoAction("clinica-x");

    expect(result).toEqual(tipos);
    expect(apiListTiposConsultaPublicoMock).toHaveBeenCalledWith("clinica-x");
  });

  it("en error, devuelve una lista vacía", async () => {
    apiListTiposConsultaPublicoMock.mockResolvedValue({ ok: false, status: 404, error: "clínica no encontrada" });

    const result = await listTiposConsultaPublicoAction("clinica-x");

    expect(result).toEqual([]);
  });
});

describe("listDisponibilidadPublicaAction", () => {
  it("devuelve los slots en éxito", async () => {
    apiListDisponibilidadPublicaMock.mockResolvedValue({ ok: true, data: { slots: ["10:00", "10:15"] } });

    const result = await listDisponibilidadPublicaAction("clinica-x", "tc-1", "2030-06-03");

    expect(result).toEqual({ slots: ["10:00", "10:15"] });
    expect(apiListDisponibilidadPublicaMock).toHaveBeenCalledWith("clinica-x", "tc-1", "2030-06-03");
  });

  it("en error, devuelve slots vacíos", async () => {
    apiListDisponibilidadPublicaMock.mockResolvedValue({ ok: false, status: 404, error: "tipo de consulta no encontrado" });

    const result = await listDisponibilidadPublicaAction("clinica-x", "tc-1", "2030-06-03");

    expect(result).toEqual({ slots: [] });
  });
});

describe("enviarVerificacionEmailAction", () => {
  it("en éxito, devuelve ok", async () => {
    apiEnviarVerificacionTurnoPublicoMock.mockResolvedValue({ ok: true, data: { mensaje: "Te mandamos un código a tu correo." } });

    const result = await enviarVerificacionEmailAction("clinica-x", "bruno@example.com");

    expect(result).toEqual({ ok: true });
    expect(apiEnviarVerificacionTurnoPublicoMock).toHaveBeenCalledWith("clinica-x", "bruno@example.com");
  });

  it("en error (p. ej. cooldown), devuelve el mensaje", async () => {
    apiEnviarVerificacionTurnoPublicoMock.mockResolvedValue({
      ok: false,
      status: 429,
      error: "esperá un momento antes de pedir otro código",
    });

    const result = await enviarVerificacionEmailAction("clinica-x", "bruno@example.com");

    expect(result).toEqual({ error: "esperá un momento antes de pedir otro código" });
  });
});

describe("confirmarVerificacionEmailAction", () => {
  it("en éxito, devuelve el token de prueba", async () => {
    apiConfirmarVerificacionTurnoPublicoMock.mockResolvedValue({ ok: true, data: { token: "token-de-prueba" } });

    const result = await confirmarVerificacionEmailAction("clinica-x", "bruno@example.com", "123456");

    expect(result).toEqual({ token: "token-de-prueba" });
    expect(apiConfirmarVerificacionTurnoPublicoMock).toHaveBeenCalledWith("clinica-x", "bruno@example.com", "123456");
  });

  it("en error (código incorrecto), devuelve el mensaje", async () => {
    apiConfirmarVerificacionTurnoPublicoMock.mockResolvedValue({
      ok: false,
      status: 400,
      error: "el código es incorrecto o ya venció",
    });

    const result = await confirmarVerificacionEmailAction("clinica-x", "bruno@example.com", "000000");

    expect(result).toEqual({ error: "el código es incorrecto o ya venció" });
  });
});
