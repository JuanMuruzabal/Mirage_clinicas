import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// public/sw.js (TR-179) no pasa por el bundler: es el archivo que el
// navegador registra tal cual. Se prueba ESE archivo, ejecutado contra un
// `self` falso con lo justo que usa.
const codigo = readFileSync(join(__dirname, "../../public/sw.js"), "utf8");

type Oyente = (evento: unknown) => void;

function pestania(url: string) {
  const p = {
    url,
    postMessage: vi.fn(),
    focus: vi.fn(async () => p),
    navigate: vi.fn(async () => p),
  };
  return p;
}

function montar(pestanias: ReturnType<typeof pestania>[] = []) {
  const oyentes: Record<string, Oyente> = {};
  const self = {
    location: { origin: "https://prisma.example" },
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: {
      matchAll: vi.fn(async () => pestanias),
      openWindow: vi.fn(async () => null),
      claim: vi.fn(async () => undefined),
    },
    skipWaiting: vi.fn(),
    addEventListener: (tipo: string, fn: Oyente) => {
      oyentes[tipo] = fn;
    },
  };
  new Function("self", codigo)(self);

  async function disparar(tipo: string, evento: Record<string, unknown>) {
    const esperas: Promise<unknown>[] = [];
    oyentes[tipo]({ ...evento, waitUntil: (p: Promise<unknown>) => esperas.push(p) });
    await Promise.all(esperas);
  }
  return { self, disparar };
}

const datosDePush = (datos: unknown) => ({ data: { json: () => datos, text: () => String(datos) } });

describe("service worker — llega un aviso", () => {
  let sw: ReturnType<typeof montar>;
  let abierta: ReturnType<typeof pestania>;

  beforeEach(() => {
    abierta = pestania("https://prisma.example/panel");
    sw = montar([abierta]);
  });

  it("lo muestra con el texto, el ícono y la URL del turno", async () => {
    await sw.disparar(
      "push",
      datosDePush({
        titulo: "Turno nuevo · lun 5/10 10:30",
        cuerpo: "Lucía Fernández · Consulta general · Clínica Norte",
        url: "/notificaciones/n-1",
        tag: "turno-t-1",
      }),
    );

    expect(sw.self.registration.showNotification).toHaveBeenCalledWith(
      "Turno nuevo · lun 5/10 10:30",
      expect.objectContaining({
        body: "Lucía Fernández · Consulta general · Clínica Norte",
        tag: "turno-t-1",
        renotify: true,
        icon: "/icons/icono-192.png",
        badge: "/icons/insignia-96.png",
        data: { url: "/notificaciones/n-1" },
      }),
    );
  });

  // Así la campana de una pestaña abierta suma al instante, sin esperar
  // al próximo minuto de sondeo.
  it("les avisa a las pestañas abiertas", async () => {
    await sw.disparar("push", datosDePush({ titulo: "Turno nuevo" }));
    expect(abierta.postMessage).toHaveBeenCalledWith({ tipo: "notificacion-nueva" });
  });

  it("un aviso que no es JSON se muestra igual, con su texto", async () => {
    await sw.disparar("push", {
      data: {
        json: () => {
          throw new SyntaxError("no es JSON");
        },
        text: () => "hola",
      },
    });
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith(
      "PRISMA",
      expect.objectContaining({ body: "hola", renotify: false, data: { url: "/clinicas" } }),
    );
  });

  it("un aviso vacío muestra PRISMA y lleva a clínicas", async () => {
    await sw.disparar("push", { data: null });
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith(
      "PRISMA",
      expect.objectContaining({ body: "", data: { url: "/clinicas" } }),
    );
  });
});

describe("service worker — tocar el aviso", () => {
  const tocar = (url?: string) => ({ notification: { close: vi.fn(), data: url ? { url } : undefined } });

  it("con PRISMA abierto, usa esa pestaña: la lleva al turno y la enfoca", async () => {
    const abierta = pestania("https://prisma.example/panel");
    const sw = montar([pestania("https://otro-sitio.example/"), abierta]);
    const evento = tocar("/notificaciones/n-1");

    await sw.disparar("notificationclick", evento);

    expect(evento.notification.close).toHaveBeenCalled();
    expect(abierta.navigate).toHaveBeenCalledWith("https://prisma.example/notificaciones/n-1");
    expect(abierta.focus).toHaveBeenCalled();
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("sin PRISMA abierto, abre una ventana nueva", async () => {
    const sw = montar([]);
    await sw.disparar("notificationclick", tocar("/notificaciones/n-1"));
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("https://prisma.example/notificaciones/n-1");
  });

  it("sin URL en el aviso, a clínicas", async () => {
    const sw = montar([]);
    await sw.disparar("notificationclick", tocar());
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("https://prisma.example/clinicas");
  });
});

describe("service worker — ciclo de vida", () => {
  // Sin esto, una versión nueva del archivo esperaría a que se cierren
  // todas las pestañas para tomar el control.
  it("una versión nueva toma el control enseguida", async () => {
    const sw = montar();
    await sw.disparar("install", {});
    await sw.disparar("activate", {});
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  // Un service worker que cachea es la forma más fácil de dejar a alguien
  // viendo una versión vieja después de un deploy.
  it("no intercepta pedidos (no cachea nada)", () => {
    expect(codigo).not.toMatch(/addEventListener\(\s*["']fetch["']/);
  });
});
