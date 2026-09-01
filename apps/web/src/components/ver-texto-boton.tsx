"use client";

import { useState } from "react";
import { ModalPortal } from "./panel/modal-portal";

interface VerTextoBotonProps {
  // Título del modal (ej. "Motivo de consulta", "Email") — también es el
  // texto accesible del botón, junto con `variante`.
  titulo: string;
  texto: string;
  // "boton" (default): pastilla con borde, para usar dentro de una fila
  // de tabla. "link": texto simple subrayado al hover, para el cuerpo
  // semi-transparente de las tarjetas del dashboard (F2.3 extra ítem 1).
  variante?: "boton" | "link";
  className?: string;
}

// VerTextoBoton (F2.3 extra ítem 1, docs/implementation-plan.md §11.5,
// tarea E1.7) — componente compartido para "Ver motivo"/"Ver mail": un
// texto largo (motivo de un horario reservado/turno, email de un
// paciente) rompía el ancho de la fila que lo mostraba inline — pedido
// explícito del cliente, ver docs/fase2.3-extra-dental-mirage.md. Se
// construye ACÁ (tarjeta 3- del Turnero, la primera en usarlo) para que
// los ítems 2.3.3 ("Ver motivo" en Turnos) y 2.3.4 ("Ver mail" en
// Pacientes) lo reusen tal cual, sin duplicar el modal.
export function VerTextoBoton({ titulo, texto, variante = "boton", className = "" }: VerTextoBotonProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
        className={
          variante === "link"
            ? `text-left text-sm font-medium text-salvia-oscuro underline-offset-2 hover:underline ${className}`
            : `rounded-full border-[0.5px] border-arena px-3 py-1 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro ${className}`
        }
      >
        Ver {titulo.toLowerCase()}
      </button>

      {abierto && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
          >
            <div className="flex w-full max-w-md flex-col overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
              <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">{titulo}</h2>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="text-2xl leading-none text-grafito/50 hover:text-grafito"
                >
                  ×
                </button>
              </div>
              <p className="whitespace-pre-wrap p-6 text-sm text-grafito">{texto}</p>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
