"use client";

import { useState } from "react";
import type { BloqueoHorario } from "@dental-mirage/shared-types";
import { crearBloqueoAction, editarBloqueoAction } from "@/app/actions/calendario-config";
import { fechaISOLocal, horaISOLocal } from "@/lib/calendar-utils";

interface AgregarReglaModalProps {
  // Especifico decide la forma del formulario (F2.3, TR-084 en
  // docs/tradeoffs.md): una regla general pide día de la semana + alcance
  // (semana/mes/todos); una específica pide una fecha puntual en su
  // lugar. El único tipo de regla disponible hoy es "bloquear horario"
  // (bloquear_horario) — el backend está pensado para sumar más
  // adelante, acá no hace falta ningún selector todavía.
  especifico: boolean;
  // Si viene, es edición (precarga sus valores y llama a PATCH en vez de
  // POST) — corrección de QA (F2.3.6): "agregar la edición para reglas
  // globales y específicas", antes solo se podía crear o borrar.
  reglaExistente?: BloqueoHorario;
  onClose: () => void;
  onGuardada: (bloqueo: BloqueoHorario) => void;
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// AgregarReglaModal — F2.3.6 (docs/implementation-plan.md §11.3). Se abre
// ENCIMA del modal de "Configuración de calendario" (que queda con blur
// atrás, pedido explícito del cliente) — no usa ModalPortal a propósito:
// ese portal saca el nodo a document.body para escapar el overflow de
// `<main>` (TR-030), pero acá el padre ya es otro modal también `fixed`,
// así que anidar directo alcanza y mantiene el orden de pila (z-index)
// simple entre los dos.
//
// Guarda de cambios sin guardar (pedido explícito del cliente): "nota que
// si se interrumpe este proceso... aparezca un cartel de tienes cambios
// pendientes, quieres salir sin guardarlos o salir y guardar, si se
// cierra de golpe no guardar lo puesto". `tocado` se prende con la
// primera edición de cualquier campo — cerrar (la X o el fondo) antes de
// eso descarta directo, sin cartel de por medio (no hay nada que perder
// todavía). Se aplica igual en edición: si abrís "Editar" y no tocás
// nada, cerrar no pregunta.
export function AgregarReglaModal({ especifico, reglaExistente, onClose, onGuardada }: AgregarReglaModalProps) {
  const editando = reglaExistente !== undefined;
  const [tocado, setTocado] = useState(false);
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);

  const [alcance, setAlcance] = useState<"semana" | "proxima_semana" | "mes" | "proximo_mes" | "todos">(
    reglaExistente?.alcance ?? "semana",
  );
  const [diaSemana, setDiaSemana] = useState(reglaExistente?.diaSemana ?? 1); // lunes por default
  const [fecha, setFecha] = useState(reglaExistente?.fecha ?? fechaISOLocal());
  const [horaDesde, setHoraDesde] = useState(reglaExistente?.horaDesde ?? "");
  const [horaHasta, setHoraHasta] = useState(reglaExistente?.horaHasta ?? "");
  const [motivo, setMotivo] = useState(reglaExistente?.motivo ?? "");

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
    if (!horaDesde || !horaHasta) {
      setError("Elegí desde y hasta qué hora bloquear.");
      return false;
    }
    if (especifico && !fecha) {
      setError("Elegí una fecha.");
      return false;
    }
    // Pedido explícito del cliente (2026-09-04): "no puedo reservar un
    // horario atrás en el tiempo, cosa que se puede ahora" — el backend
    // ya lo rechaza (parsearBloqueoRequest), esto solo evita el viaje de
    // ida y vuelta cuando es obvio de entrada. Compara fecha+horaHasta
    // completos (no solo la fecha calendario), mismo criterio que
    // combinarFechaYHora en el backend: HOY con un horario que ya
    // terminó también cuenta como pasado.
    if (especifico && fecha === fechaISOLocal() && horaHasta && horaHasta <= horaISOLocal()) {
      setError("No se puede reservar un horario en una fecha u hora que ya pasó.");
      return false;
    }
    if (especifico && fecha < fechaISOLocal()) {
      setError("No se puede reservar un horario en una fecha u hora que ya pasó.");
      return false;
    }

    const payload = especifico
      ? { especifico: true as const, fecha, horaDesde, horaHasta, motivo: motivo.trim() }
      : { especifico: false as const, alcance, diaSemana, horaDesde, horaHasta, motivo: motivo.trim() };

    setPending(true);
    const result = editando ? await editarBloqueoAction(reglaExistente.id, payload) : await crearBloqueoAction(payload);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return false;
    }
    onGuardada(result.bloqueo);
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

  // Nombre pedido por el cliente, 2026-08-30 (antes "regla
  // general/específica") — "cambiar el nombre... a horarios reservados
  // generales y horarios reservados específicos".
  const titulo = editando
    ? especifico
      ? "Editar horario reservado específico"
      : "Editar horario reservado general"
    : especifico
      ? "Agregar horario reservado específico"
      : "Agregar horario reservado general";

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

        {/* noValidate: el `min` del input de fecha es solo para que el
            selector nativo no OFREZCA un día pasado — la validación real
            (con el mismo texto de error que todo lo demás del form, nunca
            el globo nativo del navegador) es la de `guardar()` de arriba,
            mismo criterio que el resto de este formulario. */}
        {!confirmandoSalida && (
          <form onSubmit={guardarDesdeElFormulario} noValidate className="flex flex-col gap-4 p-6">
            {/* Tipo de horario reservado — hoy el único valor posible,
                mostrado como dato fijo (no hace falta un selector para
                una sola opción). */}
            <Campo label="Tipo de horario reservado">
              <p className="rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito">Bloquear horario</p>
            </Campo>

            {especifico ? (
              <Campo label="Fecha">
                <input
                  type="date"
                  value={fecha}
                  // min (pedido explícito del cliente, 2026-09-04): "no
                  // puedo reservar un horario atrás en el tiempo" — evita
                  // que el selector nativo ni siquiera ofrezca un día
                  // pasado (el backend igual lo rechaza si se lo fuerza).
                  min={fechaISOLocal()}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    setTocado(true);
                  }}
                  className={inputClass}
                />
              </Campo>
            ) : (
              <>
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
                    <option value="proxima_semana">Próxima semana</option>
                    <option value="mes">Este mes</option>
                    <option value="proximo_mes">Próximo mes</option>
                    <option value="todos">Todos los meses</option>
                  </select>
                </Campo>
                <Campo label="Día">
                  <select
                    value={diaSemana}
                    onChange={(e) => {
                      setDiaSemana(Number(e.target.value));
                      setTocado(true);
                    }}
                    className={inputClass}
                  >
                    {DIAS_SEMANA.map((nombre, i) => (
                      <option key={nombre} value={i}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
              </>
            )}

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

            {/* Motivo (corrección de QA, F2.3): "poder ponerle motivo y que
                aparezca visible en el calendario, ejemplo: una general
                puede ser limpieza semanal, una específica puede ser
                reposición de inventario" — opcional, texto libre. */}
            <Campo label="Motivo (opcional)">
              <input
                type="text"
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setTocado(true);
                }}
                placeholder="Ej.: limpieza semanal"
                maxLength={120}
                className={inputClass}
              />
            </Campo>

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
            <p className="text-sm text-grafito">Tenés cambios sin guardar en este horario reservado.</p>
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

const inputClass = "rounded-field border-[0.5px] border-arena bg-hueso px-3 py-2 text-grafito outline-none focus:border-salvia";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-grafito">{label}</span>
      {children}
    </label>
  );
}
