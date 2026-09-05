"use client";

import { useState } from "react";
import type { Paciente } from "@dental-mirage/shared-types";
import { textoEsLargo } from "@/lib/texto-largo";
import { VerTextoBoton } from "../ver-texto-boton";
import { EditarPacienteModal } from "./editar-paciente-modal";

interface PacienteDatosProps {
  pacienteInicial: Paciente;
  // emailsAlternativos/telefonosAlternativos (Fase 2.4.1, corrección de
  // QA) — vienen de PacienteDetalle (GET /pacientes/{id}), sumados a esta
  // ficha VERIFICADA al resolver un conflicto de pacientes con "el mail
  // es de la persona verificada". Quedan afuera del estado que actualiza
  // "Editar datos": esa acción solo toca DNI/teléfono/email principal,
  // nunca esta lista.
  emailsAlternativos?: string[];
  telefonosAlternativos?: string[];
}

// PacienteDatos — bloque de DNI/teléfono/email de la ficha (T3.6),
// envuelto en Client Component solo porque necesita abrir el modal de
// edición (pedido explícito del cliente, 2026-08-23) — el resto de la
// página de detalle sigue siendo Server Component.
export function PacienteDatos({ pacienteInicial, emailsAlternativos = [], telefonosAlternativos = [] }: PacienteDatosProps) {
  const [paciente, setPaciente] = useState(pacienteInicial);
  const [modalAbierto, setModalAbierto] = useState(false);

  // Fase 2.4.1, corrección de QA: "sumar ya sea mail o teléfono que
  // estaba en conflicto con la info del paciente, deberá aparecer un
  // botón con ver mails →, ver teléfonos →" — el principal siempre va
  // primero, seguido de los alternativos migrados por una resolución de
  // conflicto anterior. Con más de uno, se agrupan detrás del botón; con
  // uno solo, se muestra igual que siempre.
  const todosLosMails = [paciente.email, ...emailsAlternativos].filter((m): m is string => Boolean(m));
  const todosLosTelefonos = [paciente.telefono, ...telefonosAlternativos].filter(Boolean);

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
        <Dato
          label="Teléfono"
          valor={
            todosLosTelefonos.length > 1 ? (
              <VerTextoBoton titulo="Teléfonos" texto={todosLosTelefonos.join("\n")} flecha />
            ) : (
              paciente.telefono
            )
          }
        />
        {/* Corrección de QA: mismo "Ver mail" que ya aplica en la tabla
            de Pacientes (Extra 2.3.4/E4.1) — acá faltaba, en la sección
            "Datos de contacto" de la ficha.
            Bug real reportado por el cliente, 2026-09-05: "se migró todo
            menos el mail" — al resolver un conflicto donde la ficha
            verificada no tenía mail propio, el mail migrado quedaba como
            único elemento de `todosLosMails`, así que nunca entraba en la
            rama "> 1" de abajo; la rama de respaldo usaba `paciente.email`
            directo (vacío) en vez de `todosLosMails[0]` (que si tiene el
            mail migrado) — se veía "—" aunque el mail SÍ se había
            migrado de verdad (el teléfono nunca mostró este bug porque
            `paciente.telefono` es obligatorio, nunca vacío). */}
        <Dato
          label="Email"
          valor={
            todosLosMails.length > 1 ? (
              <VerTextoBoton titulo="Mails" texto={todosLosMails.join("\n")} flecha />
            ) : textoEsLargo(todosLosMails[0]) ? (
              <VerTextoBoton titulo="Email" texto={todosLosMails[0]!} />
            ) : (
              todosLosMails[0] || "—"
            )
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
