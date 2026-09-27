"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

// Historia — la historia de Lucía en tres escenas, como el carrusel de la
// referencia (2026-09-27, pedido del cliente: "simple y al pie"). Una frase
// y un dibujo por escena, y nada más.
//
// - Avanza sola cada 7 s, salvo que la persona la pause, esté con el mouse
//   encima o con el foco adentro, o tenga "reducir movimiento" (WCAG 2.2.2:
//   algo que se mueve solo tiene que poder pararse).
// - La escena que entra se vuelve a montar (`vuelta`), así sus dibujos de
//   una sola vez —el calendario que se llena— arrancan de nuevo.
// - En el HTML del servidor está la primera escena: se lee sin JavaScript.

const INTERVALO_MS = 7000;

function suscribirMovimiento(avisar: () => void) {
  const consulta = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  consulta?.addEventListener?.("change", avisar);
  return () => consulta?.removeEventListener?.("change", avisar);
}

function prefiereQuieto(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export interface EscenaDeLaHistoria {
  dibujo: ReactNode;
  texto: string;
}

export function Historia({ escenas }: { escenas: EscenaDeLaHistoria[] }) {
  const [actual, setActual] = useState(0);
  const [vuelta, setVuelta] = useState(0);
  const [pausada, setPausada] = useState(false);
  const [encima, setEncima] = useState(false);
  // En el servidor, quieta: no hay a quién mostrarle el movimiento.
  const quieto = useSyncExternalStore(suscribirMovimiento, prefiereQuieto, () => true);
  const avanza = !pausada && !encima && !quieto;

  function ir(n: number) {
    setActual((n + escenas.length) % escenas.length);
    setVuelta((v) => v + 1);
  }

  useEffect(() => {
    if (!avanza) return;
    const t = setTimeout(() => {
      setActual((a) => (a + 1) % escenas.length);
      setVuelta((v) => v + 1);
    }, INTERVALO_MS);
    return () => clearTimeout(t);
  }, [avanza, actual, escenas.length]);

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label="La historia de Lucía"
      className="relative"
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      onFocus={() => setEncima(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(false);
      }}
    >
      <div className="grid">
        {escenas.map((escena, n) => {
          const activa = n === actual;
          return (
            <div
              key={activa ? `activa-${vuelta}` : n}
              role="group"
              aria-roledescription="escena"
              aria-label={`${n + 1} de ${escenas.length}`}
              aria-hidden={!activa}
              inert={!activa}
              className={`col-start-1 row-start-1 flex flex-col items-center gap-6 transition-opacity duration-700 ${
                activa ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <div className="w-full max-w-[34rem]">{escena.dibujo}</div>
              <p className="max-w-xl text-balance text-center text-lg leading-relaxed text-grafito/80 sm:text-xl">
                {escena.texto}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <BotonRedondo etiqueta="Escena anterior" onClick={() => ir(actual - 1)}>
          <path d="M14 6l-6 6 6 6" />
        </BotonRedondo>
        <div className="flex items-center gap-2">
          {escenas.map((_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`Ir a la escena ${n + 1}`}
              aria-current={n === actual ? "step" : undefined}
              onClick={() => ir(n)}
              className={`h-2.5 rounded-full transition-all duration-300 ${
                n === actual ? "w-7 bg-salvia-oscuro" : "w-2.5 bg-grafito/20 hover:bg-grafito/40"
              }`}
            />
          ))}
        </div>
        <BotonRedondo etiqueta="Escena siguiente" onClick={() => ir(actual + 1)}>
          <path d="M10 6l6 6-6 6" />
        </BotonRedondo>
        {!quieto && (
          <BotonRedondo etiqueta={pausada ? "Reanudar la historia" : "Pausar la historia"} onClick={() => setPausada((p) => !p)}>
            {pausada ? <path d="M9 7l8 5-8 5z" /> : <path d="M9 7v10M15 7v10" />}
          </BotonRedondo>
        )}
      </div>
    </div>
  );
}

function BotonRedondo({ etiqueta, onClick, children }: { etiqueta: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-linea bg-marfil text-grafito/70 transition hover:border-salvia hover:text-grafito"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
