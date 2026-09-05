"use client";

import { useState } from "react";
import type { ConflictoPaciente, Paciente, TipoConsulta } from "@dental-mirage/shared-types";
import { resolverConflictoPacienteAction } from "@/app/actions/pacientes";
import { formatFechaHora } from "@/lib/turno-format";
import { ModalPortal } from "./modal-portal";

interface ResolverConflictoPacienteModalProps {
  conflicto: ConflictoPaciente;
  // tiposConsulta (corrección de QA) — para mostrar el NOMBRE del tipo de
  // consulta del turno en conflicto (y del turno vigente que ya
  // compitiera con él), no solo su id.
  tiposConsulta: TipoConsulta[];
  onClose: () => void;
  onResuelto: () => void;
}

// ResolverConflictoPacienteModal — Fase 2.4.1 (pedido textual del
// cliente): pantalla de resolución de conflictos — dos tarjetas con los
// datos de cada ficha compitiendo por el mismo DNI, el turno que originó
// el conflicto, y los dos botones de resolución exactos del documento.
// Los dos caminos son IRREVERSIBLES del lado del backend (una de las dos
// fichas se borra) — sin un paso de confirmación adicional: los botones
// YA son la confirmación explícita (mismo criterio que "asistió/ausente"
// en TurnoDetalle, cuyo aviso vive en el texto de arriba en vez de un
// segundo modal).
export function ResolverConflictoPacienteModal({ conflicto, tiposConsulta, onClose, onResuelto }: ResolverConflictoPacienteModalProps) {
  const [pending, setPending] = useState<"verificado" | "no-verificado" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nombreTipoConsulta = (tipoConsultaId?: string) => tiposConsulta.find((t) => t.id === tipoConsultaId)?.nombre ?? "—";

  // Corrección de QA, pedido textual del cliente: "marcar como en
  // conflicto en la página de pacientes pero recomendar contactarse con
  // los 2" — cuando NINGUNA de las dos fichas está verificada todavía
  // (el ticket se crea igual en ese caso, ver ConflictoPaciente en el
  // backend), no hay una identidad confirmada de la que "colgarse": el
  // profesional tiene que llamar/escribir a las dos para aclarar el
  // malentendido antes de resolver. Si además comparten teléfono, el
  // cliente pidió sumar el atajo explícito de "llamar para resolverlo
  // directamente".
  const ningunoVerificado = !conflicto.pacienteVerificado.verificado && !conflicto.pacienteEnConflicto.verificado;
  const comparteTelefono =
    !!conflicto.pacienteVerificado.telefono && conflicto.pacienteVerificado.telefono === conflicto.pacienteEnConflicto.telefono;

  async function resolver(esVerificado: boolean) {
    setError(null);
    setPending(esVerificado ? "verificado" : "no-verificado");
    const result = await resolverConflictoPacienteAction(conflicto.id, esVerificado);
    setPending(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onResuelto();
  }

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Conflicto de pacientes"
        className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-2xl max-md:max-h-[90vh] max-md:max-w-[95vw] max-md:overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Conflicto de pacientes</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>
          <div className="flex flex-col gap-5 p-6 text-sm">
            <p className="text-grafito/70">{conflicto.motivo}</p>

            {ningunoVerificado && (
              <p role="alert" className="rounded-field border-[0.5px] border-terracota bg-terracota-claro px-3 py-2 text-xs text-terracota-oscuro">
                Ninguna de las dos fichas está verificada todavía — contactate con las dos personas para aclarar el malentendido antes
                de resolver.
                {comparteTelefono && " Como comparten el mismo teléfono, también podés llamar a ese número para resolverlo directamente."}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FichaPaciente
                titulo={conflicto.pacienteVerificado.verificado ? "Ficha verificada" : "Ficha original (sin verificar)"}
                paciente={conflicto.pacienteVerificado}
              />
              <FichaPaciente
                titulo={conflicto.pacienteEnConflicto.verificado ? "Ficha verificada" : "Ficha nueva (en conflicto)"}
                paciente={conflicto.pacienteEnConflicto}
              />
            </div>

            <div className="rounded-field border-[0.5px] border-arena bg-hueso p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Turno en conflicto</p>
              <p className="mt-1 text-grafito">
                {nombreTipoConsulta(conflicto.turno.tipoConsultaId)} — {formatFechaHora(conflicto.turno.horaInicio)}
              </p>
            </div>

            {/* Corrección de QA, pedido textual del cliente: si el
                paciente verificado YA tiene un turno vigente de este
                mismo tipo, "es la persona verificada" no migra el turno
                nuevo — lo cancela y prevalece el que ya tenía. */}
            {conflicto.turnoVigenteDelMismoTipo && (
              <p role="alert" className="rounded-field border-[0.5px] border-terracota bg-terracota-claro px-3 py-2 text-xs text-terracota-oscuro">
                El paciente verificado ya tiene un turno de{" "}
                <span className="font-semibold">{nombreTipoConsulta(conflicto.turnoVigenteDelMismoTipo.tipoConsultaId)}</span> agendado
                para el {formatFechaHora(conflicto.turnoVigenteDelMismoTipo.horaInicio)}. Si confirmás que es la persona verificada, el
                turno nuevo se cancela y prevalece el que ya tenía — no se migra.
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-terracota-oscuro">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2 border-t-[0.5px] border-arena pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => resolver(false)}
                disabled={pending !== null}
                className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:opacity-60"
              >
                {pending === "no-verificado" ? "Resolviendo…" : "El mail no es del paciente verificado"}
              </button>
              <button
                type="button"
                onClick={() => resolver(true)}
                disabled={pending !== null}
                className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
              >
                {pending === "verificado" ? "Resolviendo…" : "El mail es de la persona verificada"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function FichaPaciente({ titulo, paciente }: { titulo: string; paciente: Paciente }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-field border-[0.5px] border-arena bg-hueso p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-grafito/50">{titulo}</p>
      <p className="font-[family-name:var(--font-display)] text-base font-medium text-grafito">
        {paciente.nombre} {paciente.apellido}
      </p>
      <p className="text-grafito/70">DNI {paciente.dni}</p>
      <p className="text-grafito/70">{paciente.telefono}</p>
      {paciente.email && <p className="text-grafito/70">{paciente.email}</p>}
    </div>
  );
}
