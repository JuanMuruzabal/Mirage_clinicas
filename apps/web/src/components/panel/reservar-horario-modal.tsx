"use client";

import { useState } from "react";
import type { BloqueoHorario } from "@dental-mirage/shared-types";
import { AgregarReglaModal } from "./agregar-regla-modal";
import { ModalPortal } from "./modal-portal";

interface ReservarHorarioModalProps {
  onClose: () => void;
  // onGuardada — el padre (calendar-view.tsx) recarga bloqueosGenerales/
  // bloqueosEspecificas con esto, mismo dato que ya usa
  // ConfiguracionCalendarioModal — no hace falta que este componente sepa
  // nada de esa recarga.
  onGuardada: (bloqueo: BloqueoHorario) => void;
}

// ReservarHorarioModal — acceso rápido desde la pantalla principal del
// calendario (pedido explícito del cliente, 2026-09-04): "agregar un
// acceso rápido a reservar horario... al lado de agregar turno, donde te
// dé las 2 opciones, reserva general y específica, explicar más o menos
// para qué sirven y su diferencia, le doy a agregar y sin ir al panel
// poder agregarlos por el acceso rápido, todo lo demás será dentro del
// panel de configuración". Dos pasos:
//   1. Elegir tipo (esta pantalla) — cada tarjeta explica su diferencia y
//      tiene su propio botón "Agregar" para arrancar el formulario de ESE
//      tipo directo, sin pasar por "Configuración de calendario".
//   2. El formulario de siempre (AgregarReglaModal), sin cambios — cierra
//      TODO el acceso rápido al guardar o al cancelar (nunca vuelve al
//      paso 1); si el profesional quiere el otro tipo, vuelve a abrir el
//      acceso rápido desde cero. Editar/eliminar/listar reglas existentes
//      sigue siendo cosa exclusiva de "Configuración de calendario" — este
//      acceso rápido es solo para agregar una nueva.
export function ReservarHorarioModal({ onClose, onGuardada }: ReservarHorarioModalProps) {
  const [tipoElegido, setTipoElegido] = useState<"general" | "especifica" | null>(null);

  if (tipoElegido !== null) {
    return (
      <AgregarReglaModal
        especifico={tipoElegido === "especifica"}
        onClose={onClose}
        onGuardada={(bloqueo) => {
          onGuardada(bloqueo);
          onClose();
        }}
      />
    );
  }

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reservar horario"
        className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex w-full max-w-lg flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Reservar horario</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>
          <p className="text-sm text-grafito/60">Elegí qué tipo de horario reservado querés agregar:</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <TarjetaTipo
              titulo="General"
              descripcion="Se repite: elegís un día de la semana y por cuánto tiempo (esta semana, todos los meses, etc.). Sirve para compromisos recurrentes, como una limpieza semanal o una reunión fija los martes."
              onAgregar={() => setTipoElegido("general")}
            />
            <TarjetaTipo
              titulo="Específica"
              descripcion="Una sola fecha puntual. Sirve para imprevistos de una sola vez, como una reunión de último momento un día en particular."
              onAgregar={() => setTipoElegido("especifica")}
            />
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function TarjetaTipo({ titulo, descripcion, onAgregar }: { titulo: string; descripcion: string; onAgregar: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-field border-[0.5px] border-arena bg-hueso p-4">
      <p className="font-[family-name:var(--font-display)] text-base font-medium text-grafito">{titulo}</p>
      <p className="flex-1 text-xs text-grafito/70">{descripcion}</p>
      <button
        type="button"
        onClick={onAgregar}
        className="self-start rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95"
      >
        Agregar {titulo.toLowerCase()}
      </button>
    </div>
  );
}
