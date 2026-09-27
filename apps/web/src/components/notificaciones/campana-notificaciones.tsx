"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { contarNotificacionesNuevasAction } from "@/app/actions/notificaciones";
import { IconBell } from "@/components/icons";
import { usePanelSidebar } from "@/lib/panel-sidebar-context";
import { numeroDeLaCampana } from "@/lib/notificaciones";
import { PanelNotificaciones } from "./panel-notificaciones";

// Cada cuánto se actualiza el número con la pestaña visible. Un minuto: un
// turno nuevo no es urgente al segundo, y el endpoint es por persona y por
// pestaña abierta (TR-162: en un endpoint sondeado, el costo es por
// minuto). Además se actualiza al volver a la pestaña, y al instante cuando
// el service worker recibe un aviso push.
const INTERVALO_MS = 60_000;

// CampanaNotificaciones — la campana del header, en toda pantalla con
// sesión (TR-179). El número es el de notificaciones SIN LEER de la cuenta,
// de todas sus clínicas.
export function CampanaNotificaciones() {
  const [nuevas, setNuevas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panelSidebar = usePanelSidebar();

  useEffect(() => {
    let vigente = true;
    const actualizar = () => {
      if (document.visibilityState !== "visible") return;
      contarNotificacionesNuevasAction()
        .then((n) => {
          if (vigente) setNuevas(n);
        })
        .catch(() => {});
    };
    actualizar();
    const timer = setInterval(actualizar, INTERVALO_MS);
    document.addEventListener("visibilitychange", actualizar);
    const alMensaje = (e: MessageEvent) => {
      if (e.data?.tipo === "notificacion-nueva") actualizar();
    };
    navigator.serviceWorker?.addEventListener("message", alMensaje);
    return () => {
      vigente = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", actualizar);
      navigator.serviceWorker?.removeEventListener("message", alMensaje);
    };
  }, []);

  function abrir() {
    // Si el menú del panel está abierto (mobile), se cierra: el panel de
    // notificaciones entra por el mismo lado.
    panelSidebar.close();
    setAbierto(true);
  }

  const cerrar = useCallback(() => {
    setAbierto(false);
    boton.current?.focus();
  }, []);

  const numero = numeroDeLaCampana(nuevas);

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={abrir}
        aria-expanded={abierto}
        aria-controls="panel-notificaciones"
        aria-label={nuevas > 0 ? `Notificaciones: ${nuevas} sin leer` : "Notificaciones"}
        className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-current transition-colors hover:bg-current/10"
      >
        <IconBell className="h-[22px] w-[22px]" />
        {numero && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-terracota-oscuro px-1 font-[family-name:var(--font-mono)] text-[10px] font-semibold leading-none text-marfil ring-2 ring-marfil"
          >
            {numero}
          </span>
        )}
      </button>

      {abierto && <PanelNotificaciones onCerrar={cerrar} onLeida={() => setNuevas((n) => Math.max(0, n - 1))} />}
    </>
  );
}
