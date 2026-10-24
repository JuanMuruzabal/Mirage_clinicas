"use client";

import { Dialogo } from "@/components/dialogo";
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
  // Sobre el Dialogo de todos: foco adentro, Tab atrapado, Escape (el de
  // arriba si hay varios), el foco vuelve a quien lo abrió y la página de
  // atrás no scrollea (correcciones generales, 2026-10-12).
  return (
    <Dialogo titulo="Cancelar turno" onCerrar={onClose} superficie="marfil" centrado ancho="angosto">
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
            className="rounded-control border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-marca-medio hover:text-marca"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-control bg-terracota-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
          >
            {pending ? "Cancelando…" : "Sí, cancelar turno"}
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
