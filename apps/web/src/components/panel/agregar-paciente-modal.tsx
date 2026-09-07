"use client";

import { useState } from "react";
import type { Paciente } from "@dental-mirage/shared-types";
import { crearPacienteAction } from "@/app/actions/pacientes";
import { ModalPortal } from "./modal-portal";

interface AgregarPacienteModalProps {
  onClose: () => void;
  onSuccess: (paciente: Paciente) => void;
}

// Mismas reglas de formato que TR-002 (docs/tradeoffs.md) — feedback
// inmediato acá, el backend (crearPacienteHandler) es la fuente de verdad.
const DNI_REGEX = /^\d{7,8}$/;
const TELEFONO_REGEX = /^\+?\d{10,13}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// AgregarPacienteModal — Extra 2.3.5 (E5.5): "+ Agregar paciente" en la
// sección Pacientes, alta directa sin pasar por un turno. Mismo look que
// EditarPacienteModal, con nombre/apellido sumados (esos SÍ son editables
// acá — a diferencia de EditarPacienteModal, que los deja fijos porque ya
// vienen del turno que originó la ficha).
export function AgregarPacienteModal({ onClose, onSuccess }: AgregarPacienteModalProps) {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  // conTutor (Fase 2.4.2) — "Con tutor" reemplaza el formulario de un
  // bloque por el de dos bloques (paciente + tutor) — ver
  // docs/ArquitecturaPeticionesTurno.md 3.7bis.
  const [conTutor, setConTutor] = useState(false);
  const [tutorRelacion, setTutorRelacion] = useState("");
  const [tutorNombre, setTutorNombre] = useState("");
  const [tutorTelefono, setTutorTelefono] = useState("");
  const [tutorEmail, setTutorEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nombreTrim = nombre.trim();
    const apellidoTrim = apellido.trim();
    const dniTrim = dni.trim();
    const telefonoTrim = telefono.trim();
    const emailTrim = email.trim();

    if (!nombreTrim || !apellidoTrim) {
      setError("Nombre y apellido son obligatorios.");
      return;
    }
    if (!DNI_REGEX.test(dniTrim)) {
      setError("El DNI debe tener 7 u 8 dígitos, sin puntos.");
      return;
    }
    if (!conTutor && !TELEFONO_REGEX.test(telefonoTrim)) {
      setError("El teléfono no tiene un formato válido (10 a 13 dígitos, podés incluir el +).");
      return;
    }
    if (conTutor && telefonoTrim && !TELEFONO_REGEX.test(telefonoTrim)) {
      setError("El teléfono no tiene un formato válido (10 a 13 dígitos, podés incluir el +).");
      return;
    }

    let tutorRelacionTrim = "";
    let tutorNombreTrim = "";
    let tutorTelefonoTrim = "";
    let tutorEmailTrim = "";
    if (conTutor) {
      tutorRelacionTrim = tutorRelacion;
      tutorNombreTrim = tutorNombre.trim();
      tutorTelefonoTrim = tutorTelefono.trim();
      tutorEmailTrim = tutorEmail.trim();
      if (!tutorRelacionTrim) {
        setError("Elegí la relación del tutor con el paciente.");
        return;
      }
      if (!tutorNombreTrim) {
        setError("El nombre del tutor es obligatorio.");
        return;
      }
      if (!TELEFONO_REGEX.test(tutorTelefonoTrim)) {
        setError("El teléfono del tutor no tiene un formato válido.");
        return;
      }
      if (!EMAIL_REGEX.test(tutorEmailTrim)) {
        setError("El email del tutor no tiene un formato válido.");
        return;
      }
    }

    setPending(true);
    const result = await crearPacienteAction({
      nombre: nombreTrim,
      apellido: apellidoTrim,
      dni: dniTrim,
      telefono: telefonoTrim || undefined,
      email: emailTrim || undefined,
      ...(conTutor
        ? {
            conTutor: true,
            tutorRelacion: tutorRelacionTrim,
            tutorNombre: tutorNombreTrim,
            tutorTelefono: tutorTelefonoTrim,
            tutorEmail: tutorEmailTrim,
          }
        : {}),
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
        aria-label="Agregar paciente"
        className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Corrección de QA (segunda ronda, 2026-09-06): "debe ser igual
            al del calendario con turno para paciente nuevo, que aparezca
            la pantalla con scroll, porque sino se hace muy grande" — el
            scroll (`max-h-[90vh] overflow-y-auto`) antes solo aplicaba en
            mobile (`max-md:`); con la opción "Con tutor" (~5 campos más)
            el modal también se pasa de alto en escritorio. Mismas clases
            que AgregarTurnoModal, sin el prefijo `max-md:`. */}
        <div className="flex max-h-[90vh] w-full max-w-md max-md:max-w-[90vw] flex-col overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Agregar paciente</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>

          <form onSubmit={guardar} className="flex flex-col gap-4 p-6">
            <Campo label="Nombre">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="Apellido">
              <input value={apellido} onChange={(e) => setApellido(e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="DNI">
              <input value={dni} onChange={(e) => setDni(e.target.value)} className={inputClass} />
            </Campo>
            <Campo label={conTutor ? "Teléfono (opcional)" : "Teléfono"}>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputClass} />
            </Campo>
            <Campo label="Email (opcional)">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </Campo>

            {/* Con tutor (Fase 2.4.2) — mismo criterio que el wizard
                público (pedir-turno-form.tsx, camino "otro-primera-vez"):
                al tildar, el paciente pasa a poder cargarse sin teléfono
                propio (lo tiene el tutor) y se suma el bloque de datos del
                tutor, obligatorio completo si se tilda. */}
            <label className="flex items-center gap-2 text-sm font-medium text-grafito">
              <input type="checkbox" checked={conTutor} onChange={(e) => setConTutor(e.target.checked)} className="h-4 w-4 rounded border-arena accent-salvia-oscuro" />
              Con tutor (el turno lo gestiona otra persona, ej. madre/padre)
            </label>

            {conTutor && (
              <div className="flex flex-col gap-4 rounded-field border-[0.5px] border-arena bg-hueso p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-grafito/50">Datos del tutor</p>
                <Campo label="Relación con el paciente">
                  <select value={tutorRelacion} onChange={(e) => setTutorRelacion(e.target.value)} className={inputClass}>
                    <option value="">Elegir…</option>
                    <option value="familiar">Familiar</option>
                    <option value="amigo">Amigo/a</option>
                    <option value="otro">Otro</option>
                  </select>
                </Campo>
                <Campo label="Nombre completo">
                  <input value={tutorNombre} onChange={(e) => setTutorNombre(e.target.value)} className={inputClass} />
                </Campo>
                <Campo label="Teléfono">
                  <input value={tutorTelefono} onChange={(e) => setTutorTelefono(e.target.value)} className={inputClass} />
                </Campo>
                <Campo label="Email">
                  <input type="email" value={tutorEmail} onChange={(e) => setTutorEmail(e.target.value)} className={inputClass} />
                </Campo>
              </div>
            )}

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
                {pending ? "Guardando…" : "Agregar"}
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
