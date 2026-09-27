import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiAbrirNotificacionMock, getSessionTokenMock } = vi.hoisted(() => ({
  apiAbrirNotificacionMock: vi.fn(),
  getSessionTokenMock: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiAbrirNotificacion: apiAbrirNotificacionMock }));
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const { GET } = await import("./route");

// RouteContext es un tipo global que genera Next; alcanza con la forma que
// lee el handler (params como promesa).
const tocarAviso = (id: string) =>
  GET(new Request("http://interno:3000/notificaciones/" + id), { params: Promise.resolve({ id }) } as never);

beforeEach(() => {
  vi.clearAllMocks();
  getSessionTokenMock.mockResolvedValue("token");
});

describe("GET /notificaciones/{id} — tocar un aviso en el celular", () => {
  it("lleva al turno con un 303 y Location relativa (detrás del proxy el host del pedido es el interno)", async () => {
    apiAbrirNotificacionMock.mockResolvedValue({
      ok: true,
      data: {
        tipo: "turno_nuevo",
        estadoTurno: "agendado",
        turnoId: "t-1",
        fecha: "2026-10-14",
        cambioDeClinica: true,
        sinAcceso: false,
      },
    });

    const res = await tocarAviso("n-1");

    expect(apiAbrirNotificacionMock).toHaveBeenCalledWith("token", "n-1");
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/panel/calendario?vista=dia&fecha=2026-10-14&turno=t-1");
  });

  it("sin sesión, a ingresar (sin llamar a la API)", async () => {
    getSessionTokenMock.mockResolvedValue(undefined);
    const res = await tocarAviso("n-1");
    expect(res.headers.get("Location")).toBe("/ingresar");
    expect(apiAbrirNotificacionMock).not.toHaveBeenCalled();
  });

  it("una notificación ajena o inexistente lleva al inicio de clínicas", async () => {
    apiAbrirNotificacionMock.mockResolvedValue({ ok: false, error: "notificación no encontrada" });
    const res = await tocarAviso("de-otro");
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/clinicas");
  });

  it("la bienvenida no tiene turno: también al inicio de clínicas", async () => {
    apiAbrirNotificacionMock.mockResolvedValue({
      ok: true,
      data: { tipo: "bienvenida", cambioDeClinica: false, sinAcceso: false },
    });
    const res = await tocarAviso("n-2");
    expect(res.headers.get("Location")).toBe("/clinicas");
  });
});
