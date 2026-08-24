"use client";

import type { Turno } from "@dental-mirage/shared-types";

interface CancelarTurnoModalProps {
  turno: Turno;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

// CancelarTurnoModal — confirmación extra para cancelar un turno ya
// CONFIRMADO (pedido explícito del cliente, 2026-08-23): a diferencia de un
// turno pendiente (se descarta directo, todavía no era un compromiso real
// con el paciente — ver TurnosTable), cancelar uno agendado deshace un
// compromiso ya asumido, así que pide un paso deliberado — un botón
// explícito acá adentro, no el `confirm()` nativo del navegador (que se
// cierra sin querer con Enter/Escape).
export function CancelarTurnoModal({ turno, pending, error, onClose, onConfirm }: CancelarTurnoModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cancelar turno"
      className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
        <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Cancelar turno</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
            ×
          </button>
        </div>
        <div className="flex flex-col gap-4 p-6 text-sm">
          <p className="text-grafito">
            Este turno ya está confirmado con{" "}
            <span className="font-semibold">
              {turno.nombreContacto} {turno.apellidoContacto}
            </span>
            . ¿Confirmás que querés cancelarlo? Esta acción no se puede deshacer.
          </p>
          {error && (
            <p role="alert" className="text-sm text-terracota-oscuro">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="rounded-full bg-terracota-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {pending ? "Cancelando…" : "Sí, cancelar turno"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
