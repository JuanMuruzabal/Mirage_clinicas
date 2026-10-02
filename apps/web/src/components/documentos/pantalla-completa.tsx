"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CLASE_TACTIL } from "@/components/editor-pagina/estilos";

const sinSuscripcion = () => () => {};

// PantallaCompleta — el botón que abre una hoja del módulo de documentos a
// pantalla completa (pedido del cliente, 2026-09-28: en el celular, la hoja
// entra al ancho de la pantalla y la letra del papel queda chica; y al
// completar un documento, también en la computadora). Adentro,
// la hoja ocupa todo el ancho y se puede acercar al doble para leerla con
// scroll en las dos direcciones; el pellizco del navegador sigue andando.
//
// No usa la API de pantalla completa del navegador: en el iPhone no existe
// para nada que no sea un video. Es una capa fija, con el foco adentro,
// Escape para salir y el foco de vuelta al botón al cerrar (el mismo
// criterio que `Dialogo`).
//
// `variante="en-barra"`: el botón como par del control de páginas de la
// pila de modelos (pedido del cliente, 2026-10-02: en el celular, los dos
// en la misma barra) — su mismo alto, radio y tamaño de letra.
const ASPECTO = {
  suelto: "min-h-11 rounded-full px-4 text-sm",
  "en-barra": `min-h-10 rounded-card px-3 text-[13px] ${CLASE_TACTIL}`,
} as const;

export function PantallaCompleta({
  titulo,
  children,
  etiqueta = "Ver en pantalla completa",
  variante = "suelto",
  className = "",
}: {
  titulo: string;
  /** Lo que se ve a pantalla completa. */
  children: ReactNode;
  /** Lo que dice el botón. */
  etiqueta?: string;
  variante?: keyof typeof ASPECTO;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={`inline-flex items-center gap-2 whitespace-nowrap border border-linea bg-marfil font-medium text-grafito shadow-soft hover:border-salvia ${ASPECTO[variante]} ${className}`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />
        </svg>
        {etiqueta}
      </button>
      {abierta && (
        <Capa titulo={titulo} onCerrar={() => setAbierta(false)}>
          {children}
        </Capa>
      )}
    </>
  );
}

function Capa({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const [cerca, setCerca] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    if (!montado) return;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const nodo = caja.current;
    nodo?.querySelector<HTMLElement>("[data-cerrar]")?.focus();
    // Sin esto, en el celular el scroll se le escapa a la página de atrás.
    const desbordeAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function teclado(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar.current();
        return;
      }
      if (e.key !== "Tab" || !nodo) return;
      const botones = [...nodo.querySelectorAll<HTMLElement>("button")];
      const primero = botones[0];
      const ultimo = botones[botones.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("keydown", teclado);
      document.body.style.overflow = desbordeAnterior;
      anterior?.focus();
    };
  }, [montado]);

  if (!montado) return null;
  return createPortal(
    <div ref={caja} role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-50 flex flex-col bg-grafito">
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-marfil sm:px-4">
        <p className="min-w-0 truncate text-sm font-medium">{titulo}</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-pressed={cerca}
            onClick={() => setCerca(!cerca)}
            className="min-h-11 rounded-full border border-marfil/40 px-4 text-sm font-medium hover:bg-marfil/10"
          >
            {cerca ? "Alejar" : "Acercar"}
          </button>
          <button
            type="button"
            data-cerrar
            onClick={onCerrar}
            className="min-h-11 rounded-full bg-marfil px-4 text-sm font-semibold text-grafito hover:brightness-95"
          >
            Cerrar
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 pb-6 sm:px-4">
        <div className={cerca ? "w-[200%] max-w-none" : "mx-auto w-full max-w-5xl"}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
