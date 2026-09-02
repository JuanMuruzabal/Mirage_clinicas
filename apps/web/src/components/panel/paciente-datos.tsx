"use client";

import { useState } from "react";
import type { Paciente } from "@dental-mirage/shared-types";
import { textoEsLargo } from "@/lib/texto-largo";
import { VerTextoBoton } from "../ver-texto-boton";
import { EditarPacienteModal } from "./editar-paciente-modal";

interface PacienteDatosProps {
  pacienteInicial: Paciente;
}

// PacienteDatos — bloque de DNI/teléfono/email de la ficha (T3.6),
// envuelto en Client Component solo porque necesita abrir el modal de
// edición (pedido explícito del cliente, 2026-08-23) — el resto de la
// página de detalle sigue siendo Server Component.
export function PacienteDatos({ pacienteInicial }: PacienteDatosProps) {
  const [paciente, setPaciente] = useState(pacienteInicial);
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <section className="flex flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Datos de contacto</h2>
        <button type="button" onClick={() => setModalAbierto(true)} className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
          Editar datos
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Dato label="DNI" valor={paciente.dni} />
        <Dato label="Teléfono" valor={paciente.telefono} />
        {/* Corrección de QA: mismo "Ver mail" que ya aplica en la tabla
            de Pacientes (Extra 2.3.4/E4.1) — acá faltaba, en la sección
            "Datos de contacto" de la ficha. */}
        <Dato
          label="Email"
          valor={
            textoEsLargo(paciente.email) ? <VerTextoBoton titulo="Email" texto={paciente.email} /> : paciente.email || "—"
          }
        />
      </div>

      {modalAbierto && (
        <EditarPacienteModal
          paciente={paciente}
          onClose={() => setModalAbierto(false)}
          onSuccess={(actualizado) => {
            setPaciente(actualizado);
            setModalAbierto(false);
          }}
        />
      )}
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-grafito/50">{label}</span>
      <span className="font-[family-name:var(--font-mono)] text-grafito">{valor}</span>
    </div>
  );
}
