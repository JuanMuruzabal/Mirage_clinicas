"use client";

import { useState } from "react";
import type { Paciente } from "@dental-mirage/shared-types";
import { editarPacienteAction } from "@/app/actions/pacientes";
import { ModalPortal } from "./modal-portal";

interface EditarPacienteModalProps {
  paciente: Paciente;
  onClose: () => void;
  onSuccess: (paciente: Paciente) => void;
}

// Mismas reglas de formato que TR-002 (docs/tradeoffs.md) — feedback
// inmediato acá, el backend (editarPacienteHandler) es la fuente de verdad.
const DNI_REGEX = /^\d{7,8}$/;
const TELEFONO_REGEX = /^\+?\d{10,13}$/;

// EditarPacienteModal — ficha de paciente (pedido explícito del cliente,
// 2026-08-23): corrige DNI, teléfono y email "por si hay alguna
// actualización en estos datos". A diferencia de editar un turno puntual,
// esto cambia el dato real del paciente, no solo el snapshot de contacto
// de un turno — nombre y apellido no son editables acá todavía.
export function EditarPacienteModal({ paciente, onClose, onSuccess }: EditarPacienteModalProps) {
  const [dni, setDni] = useState(paciente.dni);
  const [telefono, setTelefono] = useState(paciente.telefono);
  const [email, setEmail] = useState(paciente.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const dniTrim = dni.trim();
    const telefonoTrim = telefono.trim();
    const emailTrim = email.trim();

    if (!DNI_REGEX.test(dniTrim)) {
      setError("El DNI debe tener 7 u 8 dígitos, sin puntos.");
      return;
    }
    if (!TELEFONO_REGEX.test(telefonoTrim)) {
      setError("El teléfono no tiene un formato válido (10 a 13 dígitos, podés incluir el +).");
      return;
    }

    setPending(true);
    const result = await editarPacienteAction(paciente.id, {
      dni: dniTrim,
      telefono: telefonoTrim,
      email: emailTrim || undefined,
    });
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSuccess(result.paciente);
  }

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar datos del paciente"
        className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-md max-md:max-w-[90vw] max-md:max-h-[90vh] max-md:overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Editar datos del paciente</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>

          <form onSubmit={guardar} className="flex flex-col gap-4 p-6">
            <Campo label="DNI">
              <input value={dni} onChange={(e) => setDni(e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="Teléfono">
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="Email (opcional)">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </Campo>

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
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
              >
                {pending ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

const inputClass = "rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-grafito">{label}</span>
      {children}
    </label>
  );
}
