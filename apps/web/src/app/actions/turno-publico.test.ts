import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiSolicitarTurnoPublicoMock } = vi.hoisted(() => ({
  apiSolicitarTurnoPublicoMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiSolicitarTurnoPublico: apiSolicitarTurnoPublicoMock,
}));

const { solicitarTurnoPublicoAction } = await import("./turno-publico");

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
};

describe("solicitarTurnoPublicoAction", () => {
  it("en éxito, devuelve el id del turno creado", async () => {
    apiSolicitarTurnoPublicoMock.mockResolvedValue({ ok: true, data: { id: "turno-1" } });

    const result = await solicitarTurnoPublicoAction("clinica-x", payload);

    expect(result).toEqual({ id: "turno-1" });
    expect(apiSolicitarTurnoPublicoMock).toHaveBeenCalledWith("clinica-x", payload);
  });

  it("en error (p. ej. DNI inválido), devuelve el mensaje", async () => {
    apiSolicitarTurnoPublicoMock.mockResolvedValue({
      ok: false,
      status: 400,
      error: "el DNI debe tener 7 u 8 dígitos, sin puntos",
    });

    const result = await solicitarTurnoPublicoAction("clinica-x", payload);

    expect(result).toEqual({ error: "el DNI debe tener 7 u 8 dígitos, sin puntos" });
  });
});
