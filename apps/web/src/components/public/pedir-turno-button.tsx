"use client";

import { useState } from "react";
import { ModalPortal } from "@/components/panel/modal-portal";
import { PedirTurnoForm } from "./pedir-turno-form";

interface PedirTurnoButtonProps {
  slug: string;
  nombreClinica: string;
  telefonoClinica?: string | null;
}

// PedirTurnoButton — Fase 2.4.1, pedido explícito del cliente (corrección
// de QA sobre la primera entrega de F4.1.6): "en la página de la clínica
// cambiar el formulario actual... por un botón bien llamativo que diga
// PEDIR TURNO, y abrirá el wizard... por encima de la página con la
// pantalla de fondo con blur, como ya se hace en otras pantallas". Antes
// el wizard vivía embebido directo en la sección "Pedí tu turno" de la
// página pública — ahora esa sección es solo este botón, y el wizard
// (PedirTurnoForm, sin cambios internos) se abre en un overlay — mismo
// patrón que los modales del panel (ModalPortal + `backdrop-blur-sm`,
// cierre al tocar afuera).
export function PedirTurnoButton({ slug, nombreClinica, telefonoClinica }: PedirTurnoButtonProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-full bg-salvia-oscuro px-10 py-4 text-base font-semibold text-marfil shadow-soft hover:brightness-95"
      >
        Pedir turno
      </button>

      {abierto && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pedir turno"
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-grafito/50 p-4 py-8 backdrop-blur-sm sm:items-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
          >
            <div className="relative w-full max-w-lg">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="absolute -top-3 -right-3 flex h-9 w-9 items-center justify-center rounded-full bg-marfil text-xl leading-none text-grafito/60 shadow-soft hover:text-grafito"
              >
                ×
              </button>
              <PedirTurnoForm slug={slug} nombreClinica={nombreClinica} telefonoClinica={telefonoClinica} />
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
