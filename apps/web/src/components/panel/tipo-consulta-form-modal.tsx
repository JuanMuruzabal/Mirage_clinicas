"use client";

import { useState } from "react";
import type { TipoConsulta } from "@dental-mirage/shared-types";
import { crearTipoConsultaAction, editarTipoConsultaAction } from "@/app/actions/calendario-config";

// Paleta cerrada de swatches (corrección de QA: "el editor de color...
// debe ser más simple", en vez del selector nativo del sistema
// operativo) — los mismos hex del sistema de diseño (Sistema Cascarón,
// docs/tradeoffs.md TR-010/TR-013: globals.css), no colores inventados.
const PALETA_COLORES = [
  "#E7D9BE", // cascarón (default histórico de "Consulta general", TR-001)
  "#D6563A", // urgencia (default histórico de "Urgencia", TR-001)
  "#6E8F72", // salvia
  "#3F5943", // salvia oscuro
  "#C97F5A", // terracota
  "#8A4B2E", // terracota oscuro
  "#E7DFD1", // arena
  "#35312B", // grafito
];

interface TipoConsultaFormModalProps {
  // Si viene, es edición (precarga sus valores y llama a PATCH en vez de
  // POST) — mismo criterio que el resto de los formularios de "editar"
  // de la app (ej. editar-paciente-modal.tsx).
  tipoExistente?: TipoConsulta;
  onClose: () => void;
  onGuardado: (tipo: TipoConsulta) => void;
}

// TipoConsultaFormModal — F2.3.7 (docs/implementation-plan.md §11.3): alta
// y edición de un tipo de consulta desde "Configuración de calendario" —
// color, duración, tiempo post-consulta ("mismo concepto que tiempo
// entre turnos", TR-084 en docs/tradeoffs.md) y cantidad de sesiones
// (informativo, sin lógica asociada esta fase).
export function TipoConsultaFormModal({ tipoExistente, onClose, onGuardado }: TipoConsultaFormModalProps) {
  const [nombre, setNombre] = useState(tipoExistente?.nombre ?? "");
  const [color, setColor] = useState(tipoExistente?.color ?? "#E7D9BE");
  const [duracionMinutos, setDuracionMinutos] = useState(tipoExistente?.duracionMinutos ?? 30);
  const [tiempoPostConsultaMinutos, setTiempoPostConsultaMinutos] = useState(tipoExistente?.tiempoPostConsultaMinutos ?? 0);
  const [cantidadSesiones, setCantidadSesiones] = useState(
    tipoExistente?.cantidadSesiones !== undefined ? String(tipoExistente.cantidadSesiones) : "",
  );
  // Preferencia de atención (nueva función, pedido textual del cliente,
  // 2026-09-08): "el profesional solo quiere atender consultas generales
  // de 8:00 a 12:00... poder configurar esto y que la disponibilidad de
  // este tipo de turno sea afectada por esto" — checkbox + Desde/Hasta,
  // mismo patrón visual que "No trabajo este período" en
  // AgregarHorarioAtencionModal, pero al revés: acá arranca DESTILDADO
  // (sin preferencia, el caso normal) y tildarlo revela los dos campos.
  const [preferenciaActiva, setPreferenciaActiva] = useState(
    Boolean(tipoExistente?.preferenciaHoraDesde && tipoExistente?.preferenciaHoraHasta),
  );
  const [preferenciaHoraDesde, setPreferenciaHoraDesde] = useState(tipoExistente?.preferenciaHoraDesde ?? "");
  const [preferenciaHoraHasta, setPreferenciaHoraHasta] = useState(tipoExistente?.preferenciaHoraHasta ?? "");

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre no puede estar vacío.");
      return;
    }
    if (preferenciaActiva && (!preferenciaHoraDesde || !preferenciaHoraHasta)) {
      setError("Elegí desde y hasta qué hora para la preferencia de atención, o destildá la opción.");
      return;
    }
    if (preferenciaActiva && preferenciaHoraHasta <= preferenciaHoraDesde) {
      setError("En la preferencia de atención, la hora \"hasta\" debe ser posterior a la de \"desde\".");
      return;
    }

    const payload = {
      nombre: nombre.trim(),
      color,
      duracionMinutos,
      tiempoPostConsultaMinutos,
      cantidadSesiones: cantidadSesiones === "" ? null : Number(cantidadSesiones),
      preferenciaHoraDesde: preferenciaActiva ? preferenciaHoraDesde : "",
      preferenciaHoraHasta: preferenciaActiva ? preferenciaHoraHasta : "",
    };

    setPending(true);
    const result = tipoExistente
      ? await editarTipoConsultaAction(tipoExistente.id, payload)
      : await crearTipoConsultaAction(payload);
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    onGuardado(result.tipoConsulta);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tipoExistente ? "Editar tipo de consulta" : "Agregar tipo de consulta"}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* max-h-[90vh] (corrección de QA, foto "se ve muy grande.png"):
          con "Preferencia de atención" sumada, este form pasó a ser más
          alto que la pantalla en note/mobile, sin ningún techo — mismo
          patrón ya usado en agregar-turno-modal.tsx/editar-turno-modal.tsx/
          configuracion-calendario-modal.tsx. */}
      <div className="flex max-h-[90vh] w-full max-w-md max-md:max-w-[90vw] flex-col overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
        <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">
            {tipoExistente ? "Editar tipo de consulta" : "Agregar tipo de consulta"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
            ×
          </button>
        </div>

        <form onSubmit={guardar} className="flex flex-col gap-4 p-6">
          <Campo label="Nombre">
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
          </Campo>

          <Campo label="Color">
            {/* Paleta simple de swatches (corrección de QA: "el editor de
                color... debe ser más simple") — reemplaza el selector
                nativo del sistema operativo + hex a mano, un solo toque
                sobre un color ya pensado para el producto. */}
            <div className="flex flex-wrap gap-2">
              {PALETA_COLORES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={`Color ${hex}`}
                  aria-pressed={color === hex}
                  style={{ background: hex }}
                  className={`h-8 w-8 rounded-full border-2 ${
                    color === hex ? "border-grafito" : "border-transparent hover:border-arena"
                  }`}
                />
              ))}
            </div>
          </Campo>

          {/* Grid de 2 filas × 2 columnas (no dos <Campo> en flex-col
              lado a lado) — corrección de QA: "el botón de duración
              (minutos) y el otro de post-turno no están alineados... es
              por la longitud del texto de arriba". Con cada label y cada
              input como su propia celda de grid, la fila 1 (labels) se
              estira sola a la altura del label MÁS ALTO (el que
              envuelve a 2 líneas) e `items-end` alinea ambos textos
              contra el borde de abajo de esa fila — los dos inputs
              arrancan siempre a la misma altura en la fila 2, sin
              importar si un label ocupa 1 o 2 líneas. */}
          <div className="grid grid-cols-2 items-end gap-x-4 gap-y-1.5">
            <label htmlFor="tipo-consulta-duracion" className="text-sm font-medium text-grafito">
              Duración (minutos)
            </label>
            <label htmlFor="tipo-consulta-post-consulta" className="text-sm font-medium text-grafito">
              Tiempo post-consulta (minutos)
            </label>
            <input
              id="tipo-consulta-duracion"
              type="number"
              min={1}
              value={duracionMinutos}
              onChange={(e) => setDuracionMinutos(Number(e.target.value))}
              className={inputClass}
            />
            <input
              id="tipo-consulta-post-consulta"
              type="number"
              min={0}
              value={tiempoPostConsultaMinutos}
              onChange={(e) => setTiempoPostConsultaMinutos(Number(e.target.value))}
              className={inputClass}
            />
          </div>

          <Campo label="Cantidad de sesiones (opcional)">
            <input
              type="number"
              min={1}
              value={cantidadSesiones}
              onChange={(e) => setCantidadSesiones(e.target.value)}
              className={inputClass}
            />
          </Campo>

          {/* Preferencia de atención (nueva función, 2026-09-08): "el
              profesional solo quiere atender consultas generales de
              8:00 a 12:00" — recorta la disponibilidad SOLO para este
              tipo, además del horario de atención/bloqueos de siempre. */}
          <label className="flex items-center gap-2 text-sm text-grafito">
            {/* accent-salvia-oscuro (corrección de QA, "queda mal
                visualmente" — foto "tipo_consulta_bug.png"): sin esto,
                el checkbox usa el azul nativo del navegador, un color
                que no existe en ningún otro lugar de la paleta
                cascarón/salvia/terracota de la app. */}
            <input
              type="checkbox"
              checked={preferenciaActiva}
              onChange={(e) => setPreferenciaActiva(e.target.checked)}
              className="accent-salvia-oscuro"
            />
            Preferencia de atención
          </label>

          {preferenciaActiva && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-grafito/70">Solo ofrecer este tipo de consulta entre:</p>
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Desde">
                  <input
                    type="time"
                    value={preferenciaHoraDesde}
                    onChange={(e) => setPreferenciaHoraDesde(e.target.value)}
                    className={inputClass}
                  />
                </Campo>
                <Campo label="Hasta">
                  <input
                    type="time"
                    value={preferenciaHoraHasta}
                    onChange={(e) => setPreferenciaHoraHasta(e.target.value)}
                    className={inputClass}
                  />
                </Campo>
              </div>
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
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </form>
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
