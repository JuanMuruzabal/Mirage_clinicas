// Service worker de PRISMA — SOLO para los avisos al celular (Web Push,
// TR-179). No cachea nada ni intercepta pedidos: la app funciona igual que
// sin él, y un service worker que cachea es la forma más fácil de dejar a
// alguien viendo una versión vieja después de un deploy.

// Llega un aviso: se muestra, y se les avisa a las pestañas abiertas para
// que la campana actualice su número sin esperar al próximo minuto.
self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { titulo: "PRISMA", cuerpo: event.data ? event.data.text() : "" };
  }
  const titulo = datos.titulo || "PRISMA";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(titulo, {
        body: datos.cuerpo || "",
        tag: datos.tag,
        // Si llega otro con el mismo tag (el mismo turno), vuelve a sonar.
        renotify: Boolean(datos.tag),
        icon: "/icons/icono-192.png",
        badge: "/icons/insignia-96.png",
        lang: "es-AR",
        data: { url: datos.url || "/clinicas" },
      }),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((pestanias) => {
        for (const p of pestanias) p.postMessage({ tipo: "notificacion-nueva" });
      }),
    ]),
  );
});

// Tocar el aviso: lleva al turno. Si PRISMA ya está abierto, usa esa
// pestaña en vez de abrir otra.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/clinicas", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((pestanias) => {
      for (const p of pestanias) {
        if (new URL(p.url).origin === self.location.origin && "focus" in p) {
          return p.navigate(destino).then((navegada) => (navegada || p).focus());
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});

// Que una versión nueva de este archivo tome el control sin esperar a que
// se cierren todas las pestañas.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
