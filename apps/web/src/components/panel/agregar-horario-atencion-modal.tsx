"use client";

import { useState } from "react";
import type { HorarioAtencion } from "@dental-mirage/shared-types";
import { crearHorarioAtencionAction, editarHorarioAtencionAction } from "@/app/actions/calendario-config";
import { fechaISOLocal } from "@/lib/calendar-utils";

interface AgregarHorarioAtencionModalProps {
  // Si viene, es edición de una EXCEPCIÓN existente (nunca la general —
  // esa se edita con el form simple de arriba en ConfiguracionCalendarioModal).
  horarioExistente?: HorarioAtencion;
  onClose: () => void;
  onGuardado: (horario: HorarioAtencion) => void;
}

const ALCANCE_LABEL_EXCEPCION: Record<string, string> = {
  semana: "Esta semana",
  mes: "Este mes",
  rango: "Rango personalizado",
};

// AgregarHorarioAtencionModal — corrección de QA (2026-09-01): "puede que
// un profesional tenga horarios de atención variable... poder
// seleccionar... el alcance, es un desplegable que dirá... para esta
// semana, este mes, después de este [rango] estará de qué día a qué día,
// y después el horario de horas". Excepciones TEMPORALES a la general —
// esta modal nunca crea/edita la fila "general" en sí (esa sigue siendo
// el form simple de siempre, sin alcance para elegir). Mismo patrón
// visual y de "guarda de cambios sin guardar" que AgregarReglaModal.
export function AgregarHorarioAtencionModal({ horarioExistente, onClose, onGuardado }: AgregarHorarioAtencionModalProps) {
  const editando = horarioExistente !== undefined;
  const [tocado, setTocado] = useState(false);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);

  const [alcance, setAlcance] = useState<"semana" | "mes" | "rango">(
    horarioExistente?.alcance === "mes" || horarioExistente?.alcance === "rango" ? horarioExistente.alcance : "semana",
  );
  const [fechaDesde, setFechaDesde] = useState(horarioExistente?.fechaDesde ?? fechaISOLocal());
  const [fechaHasta, setFechaHasta] = useState(horarioExistente?.fechaHasta ?? fechaISOLocal());
  // "No trabajo este período" (corrección de QA: "si hay un día que no
  // trabaja el profesional") — sin horaDesde/horaHasta al editar, arranca
  // marcado.
  const [noTrabaja, setNoTrabaja] = useState(editando && !horarioExistente?.horaDesde);
  const [horaDesde, setHoraDesde] = useState(horarioExistente?.horaDesde ?? "");
  const [horaHasta, setHoraHasta] = useState(horarioExistente?.horaHasta ?? "");

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function pedirCerrar() {
    if (tocado) {
      setConfirmandoSalida(true);
    } else {
      onClose();
    }
  }

  async function guardar(): Promise<boolean> {
    setError(null);
    if (alcance === "rango" && (!fechaDesde || !fechaHasta)) {
      setError("Elegí desde y hasta qué fecha.");
      return false;
    }
    if (!noTrabaja && (!horaDesde || !horaHasta)) {
      setError("Elegí desde y hasta qué hora, o marcá \"No trabajo este período\".");
      return false;
    }

    const payload = {
      alcance,
      ...(alcance === "rango" ? { fechaDesde, fechaHasta } : {}),
      ...(noTrabaja ? { noTrabaja: true } : { horaDesde, horaHasta }),
    };

    setPending(true);
    const result = editando
      ? await editarHorarioAtencionAction(horarioExistente.id, payload)
      : await crearHorarioAtencionAction(payload);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return false;
    }
    onGuardado(result.horario);
    return true;
  }

  async function guardarDesdeElFormulario(e: React.FormEvent) {
    e.preventDefault();
    await guardar();
  }

  async function guardarYSalir() {
    const ok = await guardar();
    if (ok) onClose();
  }

  const titulo = editando ? "Editar excepción de horario de atención" : "Agregar excepción de horario de atención";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) pedirCerrar();
      }}
    >
      <div className="flex w-full max-w-md flex-col overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
        <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">{titulo}</h2>
          <button type="button" onClick={pedirCerrar} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
            ×
          </button>
        </div>

        {!confirmandoSalida && (
          <form onSubmit={guardarDesdeElFormulario} className="flex flex-col gap-4 p-6">
            <Campo label="Alcance">
              <select
                value={alcance}
                onChange={(e) => {
                  setAlcance(e.target.value as typeof alcance);
                  setTocado(true);
                }}
                className={inputClass}
              >
                <option value="semana">Esta semana</option>
                <option value="mes">Este mes</option>
                <option value="rango">Rango personalizado</option>
              </select>
            </Campo>

            {alcance === "rango" && (
              <div className="grid grid-cols-2 gap-4">
                {/* "Fecha desde/hasta" (no "Desde"/"Hasta" a secas): esos
                    nombres ya los usan las horas más abajo — dos campos
                    con la misma etiqueta accesible sería ambiguo. */}
                <Campo label="Fecha desde">
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => {
                      setFechaDesde(e.target.value);
                      setTocado(true);
                    }}
                    className={inputClass}
                  />
                </Campo>
                <Campo label="Fecha hasta">
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => {
                      setFechaHasta(e.target.value);
                      setTocado(true);
                    }}
                    className={inputClass}
                  />
                </Campo>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-grafito">
              <input
                type="checkbox"
                checked={noTrabaja}
                onChange={(e) => {
                  setNoTrabaja(e.target.checked);
                  setTocado(true);
                }}
              />
              No trabajo este período
            </label>

            {!noTrabaja && (
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Desde">
                  <input
                    type="time"
                    value={horaDesde}
                    onChange={(e) => {
                      setHoraDesde(e.target.value);
                      setTocado(true);
                    }}
                    className={inputClass}
                  />
                </Campo>
                <Campo label="Hasta">
                  <input
                    type="time"
                    value={horaHasta}
                    onChange={(e) => {
                      setHoraHasta(e.target.value);
                      setTocado(true);
                    }}
                    className={inputClass}
                  />
                </Campo>
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-terracota-oscuro">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="self-end rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
            >
              {pending ? "Guardando…" : editando ? "Guardar" : "Agregar"}
            </button>
          </form>
        )}

        {confirmandoSalida && (
          <div className="flex flex-col gap-4 p-6">
            <p className="text-sm text-grafito">Tenés cambios sin guardar en esta excepción de horario.</p>
            {error && (
              <p role="alert" className="text-sm text-terracota-oscuro">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmandoSalida(false)}
                className="rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-terracota hover:text-terracota-oscuro"
              >
                Salir sin guardar
              </button>
              <button
                type="button"
                onClick={guardarYSalir}
                disabled={pending}
                className="rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
              >
                {pending ? "Guardando…" : "Guardar y salir"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { ALCANCE_LABEL_EXCEPCION };

const inputClass = "rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-grafito">{label}</span>
      {children}
    </label>
  );
}
