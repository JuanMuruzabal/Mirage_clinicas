import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const acciones = vi.hoisted(() => ({
  clavePublicaPushAction: vi.fn(),
  guardarSuscripcionPushAction: vi.fn(),
  borrarSuscripcionPushAction: vi.fn(),
}));
vi.mock("@/app/actions/notificaciones", () => acciones);

const { AvisosEnEsteDispositivo } = await import("./avisos-en-este-dispositivo");

// jsdom no tiene service workers, Push ni Notification: se arma un
// navegador falso con lo justo que usa el componente.
function suscripcionFalsa(endpoint: string, clave?: number[]) {
  return {
    endpoint,
    options: { applicationServerKey: clave ? new Uint8Array(clave).buffer : null },
    toJSON: () => ({ endpoint, keys: { p256dh: "clave-p256dh", auth: "secreto" } }),
    unsubscribe: vi.fn(async () => true),
  };
}

type Permiso = "default" | "granted" | "denied";

function navegadorConPush({
  permiso = "default" as Permiso,
  yaSuscripto = false,
  respuestaAlPedir = "granted" as Permiso,
  falla = false,
  claveDeLaExistente = undefined as number[] | undefined,
} = {}) {
  const existente = suscripcionFalsa("https://push.example/existente", claveDeLaExistente);
  const nueva = suscripcionFalsa("https://push.example/nueva");
  let suscripta = yaSuscripto;
  const pushManager = {
    getSubscription: vi.fn(async () => (suscripta ? existente : null)),
    subscribe: vi.fn(async () => {
      if (falla) throw new Error("push service not available");
      suscripta = true;
      return nueva;
    }),
  };
  const registro = { pushManager };
  const serviceWorker = {
    getRegistration: vi.fn(async () => registro),
    register: vi.fn(async () => registro),
    ready: Promise.resolve(registro),
  };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  vi.stubGlobal("PushManager", function PushManager() {});
  const Notificacion = {
    permission: permiso,
    requestPermission: vi.fn(async () => {
      Notificacion.permission = respuestaAlPedir;
      return respuestaAlPedir;
    }),
  };
  vi.stubGlobal("Notification", Notificacion);
  return { serviceWorker, pushManager, Notificacion, existente, nueva };
}

beforeEach(() => {
  vi.clearAllMocks();
  acciones.clavePublicaPushAction.mockResolvedValue("AQID");
  acciones.guardarSuscripcionPushAction.mockResolvedValue(true);
  acciones.borrarSuscripcionPushAction.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

const seccion = () => screen.queryByRole("region", { name: "Avisos en este dispositivo" });

describe("AvisosEnEsteDispositivo — qué se ofrece", () => {
  it("un navegador sin Push no muestra nada", async () => {
    const { container } = render(<AvisosEnEsteDispositivo />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(acciones.clavePublicaPushAction).not.toHaveBeenCalled();
  });

  // Apple solo deja recibir avisos a una web agregada a la pantalla de
  // inicio (iOS 16.4+): en Safari, la única ayuda útil es cómo instalarla.
  it("un iPhone sin instalar explica cómo agregar PRISMA a la pantalla de inicio", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
    );
    render(<AvisosEnEsteDispositivo />);
    expect(await screen.findByText("¿Avisos en tu iPhone?")).toBeInTheDocument();
    expect(seccion()).toHaveTextContent("Agregar a inicio");
  });

  it("sin claves en el servidor no se ofrecen", async () => {
    navegadorConPush();
    acciones.clavePublicaPushAction.mockResolvedValue("");
    const { container } = render(<AvisosEnEsteDispositivo />);
    await waitFor(() => expect(acciones.clavePublicaPushAction).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("si la persona los bloqueó, explica dónde habilitarlos (una web no puede volver a preguntar)", async () => {
    navegadorConPush({ permiso: "denied" });
    render(<AvisosEnEsteDispositivo />);
    expect(await screen.findByText(/Los avisos están bloqueados/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("si la acción de la clave falla, no muestra nada", async () => {
    navegadorConPush();
    acciones.clavePublicaPushAction.mockRejectedValue(new Error("red"));
    const { container } = render(<AvisosEnEsteDispositivo />);
    await waitFor(() => expect(acciones.clavePublicaPushAction).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AvisosEnEsteDispositivo — activar", () => {
  it("pide permiso, registra el service worker, suscribe con la clave del servidor y la guarda", async () => {
    const nav = navegadorConPush();
    const user = userEvent.setup();
    render(<AvisosEnEsteDispositivo />);

    await user.click(await screen.findByRole("button", { name: "Activar" }));

    expect(await screen.findByText("Avisos activos en este dispositivo.")).toBeInTheDocument();
    expect(nav.Notificacion.requestPermission).toHaveBeenCalled();
    expect(nav.serviceWorker.register).toHaveBeenCalledWith("/sw.js");
    const opciones = nav.pushManager.subscribe.mock.calls[0] as unknown as [{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }];
    expect(opciones[0].userVisibleOnly).toBe(true);
    expect(Array.from(opciones[0].applicationServerKey)).toEqual([1, 2, 3]);
    expect(acciones.guardarSuscripcionPushAction).toHaveBeenCalledWith({
      endpoint: "https://push.example/nueva",
      keys: { p256dh: "clave-p256dh", auth: "secreto" },
    });
  });

  it("si dice que no, queda bloqueado", async () => {
    navegadorConPush({ respuestaAlPedir: "denied" });
    const user = userEvent.setup();
    render(<AvisosEnEsteDispositivo />);
    await user.click(await screen.findByRole("button", { name: "Activar" }));
    expect(await screen.findByText(/Los avisos están bloqueados/)).toBeInTheDocument();
  });

  it("si cierra el cartel sin elegir, se puede volver a intentar", async () => {
    const nav = navegadorConPush({ respuestaAlPedir: "default" });
    const user = userEvent.setup();
    render(<AvisosEnEsteDispositivo />);
    await user.click(await screen.findByRole("button", { name: "Activar" }));
    expect(await screen.findByRole("button", { name: "Activar" })).toBeEnabled();
    expect(nav.serviceWorker.register).not.toHaveBeenCalled();
  });

  // Una suscripción que el servidor no guardó es un aviso que nunca va a
  // llegar: se deshace en el navegador en vez de mostrarla como activa.
  it("si el servidor no la guarda, la deshace y lo dice", async () => {
    const nav = navegadorConPush();
    acciones.guardarSuscripcionPushAction.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<AvisosEnEsteDispositivo />);
    await user.click(await screen.findByRole("button", { name: "Activar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos activar los avisos. Probá de nuevo");
    expect(nav.nueva.unsubscribe).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument();
  });

  it("si el navegador no puede suscribirse, lo dice", async () => {
    navegadorConPush({ falla: true });
    const user = userEvent.setup();
    render(<AvisosEnEsteDispositivo />);
    await user.click(await screen.findByRole("button", { name: "Activar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos activar los avisos en este navegador.");
  });
});

describe("AvisosEnEsteDispositivo — ya activos", () => {
  // En un navegador compartido, a quien le llegan los avisos es al último
  // que entró: la suscripción existente se registra a nombre de ESTA cuenta.
  it("vuelve a registrar la suscripción del navegador a nombre de esta cuenta", async () => {
    navegadorConPush({ permiso: "granted", yaSuscripto: true });
    render(<AvisosEnEsteDispositivo />);
    expect(await screen.findByText("Avisos activos en este dispositivo.")).toBeInTheDocument();
    expect(acciones.guardarSuscripcionPushAction).toHaveBeenCalledWith({
      endpoint: "https://push.example/existente",
      keys: { p256dh: "clave-p256dh", auth: "secreto" },
    });
  });

  it("una suscripción hecha con la clave de hoy se usa tal cual", async () => {
    const nav = navegadorConPush({ permiso: "granted", yaSuscripto: true, claveDeLaExistente: [1, 2, 3] });
    render(<AvisosEnEsteDispositivo />);
    expect(await screen.findByText("Avisos activos en este dispositivo.")).toBeInTheDocument();
    expect(nav.pushManager.subscribe).not.toHaveBeenCalled();
    expect(nav.existente.unsubscribe).not.toHaveBeenCalled();
  });

  // Si cambiaron las claves VAPID del servidor, el servicio de push rechaza
  // los avisos: la suscripción vieja se borra y se rehace sin volver a
  // pedir permiso, que ya estaba dado.
  it("una suscripción hecha con OTRA clave se rehace sola con la de hoy", async () => {
    const nav = navegadorConPush({ permiso: "granted", yaSuscripto: true, claveDeLaExistente: [9, 9, 9] });
    render(<AvisosEnEsteDispositivo />);

    expect(await screen.findByText("Avisos activos en este dispositivo.")).toBeInTheDocument();
    expect(acciones.borrarSuscripcionPushAction).toHaveBeenCalledWith("https://push.example/existente");
    expect(nav.existente.unsubscribe).toHaveBeenCalled();
    expect(nav.Notificacion.requestPermission).not.toHaveBeenCalled();
    const opciones = nav.pushManager.subscribe.mock.calls[0] as unknown as [{ applicationServerKey: Uint8Array }];
    expect(Array.from(opciones[0].applicationServerKey)).toEqual([1, 2, 3]);
    expect(acciones.guardarSuscripcionPushAction).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example/nueva" }),
    );
  });

  it("si no se puede rehacer, ofrece activar de nuevo", async () => {
    navegadorConPush({ permiso: "granted", yaSuscripto: true, claveDeLaExistente: [9, 9, 9], falla: true });
    render(<AvisosEnEsteDispositivo />);
    expect(await screen.findByRole("button", { name: "Activar" })).toBeInTheDocument();
    expect(acciones.guardarSuscripcionPushAction).not.toHaveBeenCalled();
  });

  it("con permiso pero sin suscripción, ofrece activar", async () => {
    navegadorConPush({ permiso: "granted" });
    render(<AvisosEnEsteDispositivo />);
    expect(await screen.findByRole("button", { name: "Activar" })).toBeInTheDocument();
    expect(acciones.guardarSuscripcionPushAction).not.toHaveBeenCalled();
  });

  it("desactivar la borra del servidor y del navegador", async () => {
    const nav = navegadorConPush({ permiso: "granted", yaSuscripto: true });
    const user = userEvent.setup();
    render(<AvisosEnEsteDispositivo />);

    await user.click(await screen.findByRole("button", { name: "Desactivar" }));

    expect(await screen.findByRole("button", { name: "Activar" })).toBeInTheDocument();
    expect(acciones.borrarSuscripcionPushAction).toHaveBeenCalledWith("https://push.example/existente");
    expect(nav.existente.unsubscribe).toHaveBeenCalled();
  });

  it("si desactivar falla, lo dice", async () => {
    const nav = navegadorConPush({ permiso: "granted", yaSuscripto: true });
    nav.existente.unsubscribe.mockRejectedValue(new Error("x"));
    const user = userEvent.setup();
    render(<AvisosEnEsteDispositivo />);
    await user.click(await screen.findByRole("button", { name: "Desactivar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos desactivar los avisos.");
  });
});
