"use client";

import { useState } from "react";
import { ModalPortal } from "./modal-portal";

// QueEsVerificadoBoton — pedido textual del cliente: "agregue en la
// sección de pacientes un botón que diga 'qué es un paciente verificado?'
// y que dé una explicación de qué es un paciente verificado". Puramente
// informativo (sin Server Action, sin efecto sobre ningún dato) — mismo
// criterio de "verificado" que EstadoVerificadoBadge en pacientes-table.tsx
// y pacienteEstaVerificado del lado del backend: al menos un turno
// resuelto y marcado "asistió".
export function QueEsVerificadoBoton() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
      >
        ¿Qué es un paciente verificado?
      </button>
      {abierto && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Qué es un paciente verificado"
            className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
          >
            <div className="w-full max-w-md max-md:max-h-[85vh] max-md:overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
              <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Paciente verificado</h2>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="text-2xl leading-none text-grafito/50 hover:text-grafito"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-col gap-4 p-6 text-sm text-grafito">
                <p>
                  Un paciente queda <strong>verificado</strong> apenas se confirma que asistió a al menos un turno — la clínica
                  comprobó en persona que esa identidad y esos datos de contacto son reales.
                </p>
                <p>
                  Hasta ese momento, el DNI que cargó puede coincidir con el de otra ficha (por ejemplo, si alguien más pidió un turno
                  usando el mismo documento por error o mala intención). Una vez verificado, esa ficha pasa a ser la que prevalece si
                  aparece un conflicto de identidad con ese DNI.
                </p>
                <p className="text-xs text-grafito/60">
                  Un paciente cargado a mano desde el panel (sin pasar por la página pública) queda verificado desde el principio — ya
                  fue el propio profesional quien confirmó sus datos.
                </p>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
