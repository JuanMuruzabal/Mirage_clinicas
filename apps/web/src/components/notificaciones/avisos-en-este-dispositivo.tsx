"use client";

import { useEffect, useState } from "react";
import {
  borrarSuscripcionPushAction,
  clavePublicaPushAction,
  guardarSuscripcionPushAction,
} from "@/app/actions/notificaciones";
import type { SuscripcionPush } from "@/lib/api";
import { claveDeServidorEnBytes } from "@/lib/notificaciones";

type Estado = "cargando" | "no-disponible" | "ios-instalar" | "bloqueado" | "activo" | "inactivo";

// Avisos al celular (Web Push, TR-179), por DISPOSITIVO: activarlos en el
// celular no los activa en la compu. Estados:
//   - no-disponible: el navegador no sabe hacerlo, o el servidor no tiene
//     las claves configuradas → no se muestra nada;
//   - ios-instalar: iPhone con PRISMA abierto en Safari. Apple solo deja
//     recibir avisos a una web AGREGADA A LA PANTALLA DE INICIO (iOS 16.4+);
//   - bloqueado: la persona dijo que no. Una web no puede volver a
//     preguntar: hay que habilitarlo en la configuración del sitio;
//   - activo / inactivo.
function soportaPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function esIOSSinInstalar(): boolean {
  if (typeof window === "undefined") return false;
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalada =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !instalada;
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  const registro = await navigator.serviceWorker.getRegistration();
  return (await registro?.pushManager.getSubscription()) ?? null;
}

/** ¿La suscripción se hizo con la clave que el servidor usa HOY? Si
 *  cambiaron las claves VAPID, el servicio de push rechaza los avisos
 *  firmados con la nueva. Si el navegador no informa la clave, no hay con
 *  qué comparar: se da por buena. */
function esDeEstaClave(sub: PushSubscription, clave: string): boolean {
  const actual = sub.options?.applicationServerKey;
  if (!actual) return true;
  const a = new Uint8Array(actual);
  const b = claveDeServidorEnBytes(clave);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Rehace una suscripción hecha con otra clave. El permiso ya está dado,
 *  así que no se vuelve a preguntar. null si no se pudo. */
async function renovarSuscripcion(vieja: PushSubscription, clave: string): Promise<PushSubscription | null> {
  try {
    await borrarSuscripcionPushAction(vieja.endpoint);
    await vieja.unsubscribe();
    const registro = await navigator.serviceWorker.getRegistration();
    if (!registro) return null;
    return await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveDeServidorEnBytes(clave),
    });
  } catch {
    return null;
  }
}

export function AvisosEnEsteDispositivo() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [clave, setClave] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      let siguiente: Estado;
      let clavePublica = "";
      if (!soportaPush()) {
        siguiente = esIOSSinInstalar() ? "ios-instalar" : "no-disponible";
      } else {
        clavePublica = await clavePublicaPushAction();
        if (!clavePublica) {
          siguiente = "no-disponible";
        } else if (Notification.permission === "denied") {
          siguiente = "bloqueado";
        } else {
          let sub = Notification.permission === "granted" ? await suscripcionActual() : null;
          if (sub && !esDeEstaClave(sub, clavePublica)) {
            sub = await renovarSuscripcion(sub, clavePublica);
          }
          if (sub) {
            // El navegador ya estaba suscripto: se vuelve a registrar a
            // nombre de ESTA cuenta (en un navegador compartido, el último
            // que entra es a quien le llegan los avisos).
            await guardarSuscripcionPushAction(sub.toJSON() as SuscripcionPush);
          }
          siguiente = sub ? "activo" : "inactivo";
        }
      }
      if (vigente) {
        setClave(clavePublica);
        setEstado(siguiente);
      }
    })().catch(() => {
      if (vigente) setEstado("no-disponible");
    });
    return () => {
      vigente = false;
    };
  }, []);

  async function activar() {
    setTrabajando(true);
    setError(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        return;
      }
      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: claveDeServidorEnBytes(clave),
      });
      const ok = await guardarSuscripcionPushAction(sub.toJSON() as SuscripcionPush);
      if (!ok) {
        await sub.unsubscribe();
        setError("No pudimos activar los avisos. Probá de nuevo en un momento.");
        return;
      }
      setEstado("activo");
    } catch {
      setError("No pudimos activar los avisos en este navegador.");
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
    setTrabajando(true);
    setError(null);
    try {
      const sub = await suscripcionActual();
      if (sub) {
        await borrarSuscripcionPushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } catch {
      setError("No pudimos desactivar los avisos.");
    } finally {
      setTrabajando(false);
    }
  }

  if (estado === "cargando" || estado === "no-disponible") return null;

  return (
    <section aria-label="Avisos en este dispositivo" className="border-t-[0.5px] border-arena bg-marfil/60 px-6 py-4">
      {estado === "inactivo" && (
        <div className="flex items-center gap-4">
          <p className="flex-1 text-sm text-grafito/80">
            <span className="block font-semibold text-grafito">Avisos en este dispositivo</span>
            Te llega cada turno nuevo aunque tengas PRISMA cerrado.
          </p>
          <button
            type="button"
            onClick={activar}
            disabled={trabajando}
            className="flex-shrink-0 rounded-full border border-salvia-oscuro px-4 py-2 text-xs font-bold uppercase tracking-wider text-salvia-oscuro transition hover:bg-salvia-oscuro hover:text-marfil disabled:opacity-60"
          >
            {trabajando ? "Activando…" : "Activar"}
          </button>
        </div>
      )}

      {estado === "activo" && (
        <div className="flex items-center gap-3 text-sm text-grafito/80">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-salvia" aria-hidden="true" />
          <span className="flex-1">Avisos activos en este dispositivo.</span>
          <button
            type="button"
            onClick={desactivar}
            disabled={trabajando}
            className="flex-shrink-0 text-xs font-semibold text-grafito/60 underline-offset-2 hover:text-grafito hover:underline disabled:opacity-60"
          >
            Desactivar
          </button>
        </div>
      )}

      {estado === "bloqueado" && (
        <p className="text-sm text-grafito/70">
          Los avisos están bloqueados en este navegador. Para recibirlos, permitilos desde la configuración del sitio.
        </p>
      )}

      {estado === "ios-instalar" && (
        <p className="text-sm text-grafito/70">
          <span className="block font-semibold text-grafito">¿Avisos en tu iPhone?</span>
          Agregá PRISMA a la pantalla de inicio: tocá <strong className="font-semibold">Compartir</strong> y después{" "}
          <strong className="font-semibold">Agregar a inicio</strong>. Abrila desde ahí y activalos.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-terracota-oscuro">
          {error}
        </p>
      )}
    </section>
  );
}
