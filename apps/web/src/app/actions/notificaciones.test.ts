import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  apiAbrirNotificacion: vi.fn(),
  apiBandejaDeNotificaciones: vi.fn(),
  apiBorrarSuscripcionPush: vi.fn(),
  apiConfiguracionPush: vi.fn(),
  apiContadorDeNotificaciones: vi.fn(),
  apiGuardarSuscripcionPush: vi.fn(),
  apiLeerNotificacion: vi.fn(),
}));
const { getSessionTokenMock } = vi.hoisted(() => ({ getSessionTokenMock: vi.fn() }));

vi.mock("@/lib/api", () => api);
vi.mock("@/lib/session", () => ({ getSessionToken: getSessionTokenMock }));

const {
  abrirNotificacionAction,
  bandejaDeNotificacionesAction,
  borrarSuscripcionPushAction,
  clavePublicaPushAction,
  contarNotificacionesNuevasAction,
  guardarSuscripcionPushAction,
  leerNotificacionAction,
} = await import("./notificaciones");

const suscripcion = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionTokenMock.mockResolvedValue("token");
});

// La campana vive en el layout raíz y se dibuja en cualquier pantalla:
// sin sesión ninguna acción redirige — devuelven "nada" y no llaman a la API.
describe("sin sesión, todas devuelven 'nada' sin llamar a la API", () => {
  beforeEach(() => getSessionTokenMock.mockResolvedValue(undefined));

  it.each([
    ["contar", () => contarNotificacionesNuevasAction(), 0],
    ["bandeja", () => bandejaDeNotificacionesAction("nuevas"), null],
    ["leer", () => leerNotificacionAction("n-1"), false],
    ["abrir", () => abrirNotificacionAction("n-1"), { error: "Tu sesión venció. Volvé a ingresar." }],
    ["clave", () => clavePublicaPushAction(), ""],
    ["guardar suscripción", () => guardarSuscripcionPushAction(suscripcion), false],
    ["borrar suscripción", () => borrarSuscripcionPushAction(suscripcion.endpoint), false],
  ])("%s", async (_nombre, accion, esperado) => {
    await expect(accion()).resolves.toEqual(esperado);
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("contarNotificacionesNuevasAction", () => {
  it("devuelve el número de la API", async () => {
    api.apiContadorDeNotificaciones.mockResolvedValue({ ok: true, data: { nuevas: 4 } });
    await expect(contarNotificacionesNuevasAction()).resolves.toBe(4);
    expect(api.apiContadorDeNotificaciones).toHaveBeenCalledWith("token");
  });

  it("ante un error, 0: un número inventado sería peor que ninguno", async () => {
    api.apiContadorDeNotificaciones.mockResolvedValue({ ok: false, error: "caída" });
    await expect(contarNotificacionesNuevasAction()).resolves.toBe(0);
  });
});

describe("bandejaDeNotificacionesAction", () => {
  it("pide la pestaña elegida", async () => {
    const bandeja = { notificaciones: [], nuevas: 0, leidas: 2 };
    api.apiBandejaDeNotificaciones.mockResolvedValue({ ok: true, data: bandeja });
    await expect(bandejaDeNotificacionesAction("leidas")).resolves.toEqual(bandeja);
    expect(api.apiBandejaDeNotificaciones).toHaveBeenCalledWith("token", "leidas");
  });

  it("ante un error, null (la bandeja muestra 'reintentar')", async () => {
    api.apiBandejaDeNotificaciones.mockResolvedValue({ ok: false, error: "caída" });
    await expect(bandejaDeNotificacionesAction("nuevas")).resolves.toBeNull();
  });
});

describe("leerNotificacionAction", () => {
  it("devuelve si la API la marcó", async () => {
    api.apiLeerNotificacion.mockResolvedValueOnce({ ok: true, data: null });
    await expect(leerNotificacionAction("n-1")).resolves.toBe(true);
    api.apiLeerNotificacion.mockResolvedValueOnce({ ok: false, error: "no encontrada" });
    await expect(leerNotificacionAction("n-2")).resolves.toBe(false);
    expect(api.apiLeerNotificacion).toHaveBeenCalledWith("token", "n-1");
  });
});

describe("abrirNotificacionAction", () => {
  it("traduce la respuesta al destino de 'Ver turno'", async () => {
    api.apiAbrirNotificacion.mockResolvedValue({
      ok: true,
      data: {
        tipo: "turno_nuevo",
        estadoTurno: "agendado",
        turnoId: "t-1",
        fecha: "2026-10-05",
        cambioDeClinica: false,
        sinAcceso: false,
      },
    });
    await expect(abrirNotificacionAction("n-1")).resolves.toEqual({
      destino: "/panel/calendario?vista=dia&fecha=2026-10-05&turno=t-1",
      recargar: false,
    });
  });

  // El header y el selector de clínica muestran la clínica anterior: sin
  // recargar la página entera, quedarían desactualizados.
  it("si la sesión cambió de clínica, pide recargar", async () => {
    api.apiAbrirNotificacion.mockResolvedValue({
      ok: true,
      data: { tipo: "turno_nuevo", estadoTurno: "cancelada", turnoId: "t-1", cambioDeClinica: true, sinAcceso: false },
    });
    await expect(abrirNotificacionAction("n-1")).resolves.toEqual({
      destino: "/panel/turnos?estado=cancelada&turno=t-1",
      recargar: true,
    });
  });

  it("devuelve el error de la API", async () => {
    api.apiAbrirNotificacion.mockResolvedValue({ ok: false, error: "notificación no encontrada" });
    await expect(abrirNotificacionAction("n-9")).resolves.toEqual({ error: "notificación no encontrada" });
  });
});

describe("avisos al celular", () => {
  it("la clave pública; vacía si la API falla (los avisos no se ofrecen)", async () => {
    api.apiConfiguracionPush.mockResolvedValueOnce({ ok: true, data: { clavePublica: "BCLAVE" } });
    await expect(clavePublicaPushAction()).resolves.toBe("BCLAVE");
    api.apiConfiguracionPush.mockResolvedValueOnce({ ok: false, error: "caída" });
    await expect(clavePublicaPushAction()).resolves.toBe("");
  });

  it("guardar y borrar la suscripción de este navegador", async () => {
    api.apiGuardarSuscripcionPush.mockResolvedValue({ ok: true, data: null });
    api.apiBorrarSuscripcionPush.mockResolvedValue({ ok: false, error: "x" });
    await expect(guardarSuscripcionPushAction(suscripcion)).resolves.toBe(true);
    await expect(borrarSuscripcionPushAction(suscripcion.endpoint)).resolves.toBe(false);
    expect(api.apiGuardarSuscripcionPush).toHaveBeenCalledWith("token", suscripcion);
    expect(api.apiBorrarSuscripcionPush).toHaveBeenCalledWith("token", suscripcion.endpoint);
  });
});
