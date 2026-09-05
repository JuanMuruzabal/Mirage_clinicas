"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConflictoPaciente, TipoConsulta } from "@dental-mirage/shared-types";
import { ResolverConflictoPacienteModal } from "./resolver-conflicto-paciente-modal";

interface ConflictosPacienteBannerProps {
  conflictos: ConflictoPaciente[];
  // tiposConsulta (corrección de QA) — para mostrar el NOMBRE del tipo de
  // consulta del turno en conflicto en vez de solo su id.
  tiposConsulta: TipoConsulta[];
}

// ConflictosPacienteBanner — Fase 2.4.1: mismo lenguaje visual que el
// banner de conflicto del calendario (TR-095, calendar-view.tsx) — caja
// terracota que colapsa a 0 altura sin conflictos pendientes, en vez de
// desmontar/montar el nodo (anima el "desaparecerá cuando ya no haya
// conflictos" sin JS ni medir nada a mano). Al tocarlo, abre el conflicto
// más antiguo — la lista ya viene ordenada por created_at desde el
// backend (listConflictosPacienteHandler). `router.refresh()` al resolver
// uno: PacientesPage es un Server Component que resuelve la lista desde
// sus props, mismo criterio que AgregarPacienteButton.
export function ConflictosPacienteBanner({ conflictos, tiposConsulta }: ConflictosPacienteBannerProps) {
  const [seleccionado, setSeleccionado] = useState<ConflictoPaciente | null>(null);
  const router = useRouter();

  return (
    <>
      <div
        className={`grid transition-[grid-template-rows] duration-500 ease-out ${
          conflictos.length > 0 ? "grid-rows-[1fr] mb-2" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          {/* Renderizado condicional (no solo escondido por CSS): a 0
              conflictos, el botón no debe quedar en el árbol de
              accesibilidad ni ser tabulable — la altura en 0 vía
              grid-rows ya alcanza para el colapso animado. */}
          {conflictos.length > 0 && (
            <button
              type="button"
              onClick={() => setSeleccionado(conflictos[0])}
              className="flex w-full items-center justify-between gap-3 rounded-card border-[0.5px] border-terracota bg-terracota/10 px-4 py-3 text-left text-sm font-medium text-terracota-oscuro hover:bg-terracota/15"
            >
              <span>
                Tenés {conflictos.length} {conflictos.length === 1 ? "conflicto" : "conflictos"} de pacientes, tocá para ver
              </span>
            </button>
          )}
        </div>
      </div>

      {seleccionado && (
        <ResolverConflictoPacienteModal
          conflicto={seleccionado}
          tiposConsulta={tiposConsulta}
          onClose={() => setSeleccionado(null)}
          onResuelto={() => {
            setSeleccionado(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
