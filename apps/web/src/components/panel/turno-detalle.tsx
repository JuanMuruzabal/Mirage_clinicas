"use client";

import { useState } from "react";
import Link from "next/link";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { marcarAsistenciaAction } from "@/app/actions/turnos";
import { formatDiaLargo, formatHora } from "@/lib/calendar-utils";
import { temaTipoConsulta } from "@/lib/turno-format";
import { ModalPortal } from "./modal-portal";

interface TurnoDetalleProps {
  turno: Turno;
  tiposConsulta: TipoConsulta[];
  onClose: () => void;
  // enConflicto — paso 2 (manejo de conflictos con turnos, 2026-09-04):
  // true cuando este turno se abrió desde la tarjeta "Ver eventos"/el
  // modal de conflictos (bloqueo-detalle-modal.tsx) porque se solapa con
  // uno o más horarios reservados Y TODAVÍA no pasó — "al hacer click en
  // el turno mostrará info del turno y abajo el mensaje turno en
  // conflicto con un horario reservado, hablar con el cliente para
  // acordar otro horario" (textual del cliente). Ausente/false cuando se
  // abre desde el grid normal, o cuando el turno YA se resolvió (ver el
  // guard `!resuelto` más abajo — "que los turnos en conflicto... pasen a
  // resueltos... dejar de decir turno en conflicto", el aviso ya no
  // corresponde ahí, aunque el padre lo siga mandando en true).
  enConflicto?: boolean;
}

// Al tocar una casilla de consulta ya agendada: hora, paciente adjunto y
// tipo de consulta (spec §4.3) — un panel simple, no otro formulario. Dos
// atajos sumados a pedido del cliente (2026-08-23): "Ver turno" manda a la
// fila de este turno en la vista Turnos —ahí es donde se puede
// editar/cancelar de verdad, este panel es solo de lectura— con esa fila
// ya desplegada (vía `?turno=`, ver TurnosTable/abrirId) para no obligar
// al profesional a volver a buscarla; "Ver paciente" manda a su ficha
// completa. La hora pasó al tope del panel, en un tamaño grande, y ambos
// atajos son ahora botones (antes texto chico al lado del título, se
// confundían con el fondo — mismo pedido del cliente).
//
// Asistencia (pedido explícito del cliente, 2026-09-04): "los turnos
// resueltos ahora tienen la opción al ser tocados de marcar asistidos o
// ausente, cosa de poder guardar ese dato... tanto en el calendario, como
// de la sección de turnos resueltos en la pestaña de turnos" — acá es el
// lado "calendario" de ese pedido (turnos-table.tsx tiene el mismo flujo
// para el otro lado). Solo aparece en un turno YA resuelto — antes no
// tiene sentido marcarlo. Irreversible (corrección de QA, 2026-09-04,
// textual): "me debe aparecer un aviso que la elección es irreversible y
// confirmar esto" — tocar "Asistió"/"Ausente" NO manda nada todavía, solo
// pide confirmación con ese aviso; recién al confirmar se llama a la
// Server Action (el backend además la hace cumplir, rechaza cualquier
// intento posterior sobre este turno). Una vez marcada, se muestra como
// una etiqueta fija, sin botones — no hay forma de volver atrás.
export function TurnoDetalle({ turno, tiposConsulta, onClose, enConflicto = false }: TurnoDetalleProps) {
  const tipo = tiposConsulta.find((t) => t.id === turno.tipoConsultaId);
  const inicio = turno.horaInicio ? new Date(turno.horaInicio) : null;
  const fin = turno.horaFin ? new Date(turno.horaFin) : null;
  const resuelto = fin !== null && fin.getTime() < new Date().getTime();
  // TR-076 en docs/tradeoffs.md (2026-08-27, pedido explícito del
  // cliente: "tocar un turno resuelto... lleva a la pestaña de
  // Confirmadas, no Resueltas"). turnos/page.tsx trata "resuelto" como
  // un pseudo-valor propio de `estado` en la URL (`?estado=resuelto`,
  // ver parseTab/filtrosDeTab ahí) — hay que mandar ESE valor, no el
  // `turno.estado` real ("agendado"), para que la pestaña que se abre
  // sea la correcta.
  const hrefVerTurno = `/panel/turnos?estado=${resuelto ? "resuelto" : turno.estado}&q=${encodeURIComponent(turno.dniContacto)}&turno=${turno.id}`;

  const [asistencia, setAsistencia] = useState(turno.asistencia ?? null);
  // pidiendoConfirmar — el valor que se tocó y todavía espera el "sí,
  // confirmar" del aviso de irreversibilidad; `null` mientras se muestran
  // los dos botones de siempre.
  const [pidiendoConfirmar, setPidiendoConfirmar] = useState<"asistio" | "ausente" | null>(null);
  const [pendingAsistencia, setPendingAsistencia] = useState(false);
  const [errorAsistencia, setErrorAsistencia] = useState<string | null>(null);

  async function confirmarAsistencia(valor: "asistio" | "ausente") {
    setErrorAsistencia(null);
    setPendingAsistencia(true);
    const result = await marcarAsistenciaAction(turno.id, valor);
    setPendingAsistencia(false);
    setPidiendoConfirmar(null);
    if ("error" in result) {
      setErrorAsistencia(result.error);
      return;
    }
    setAsistencia(valor);
  }

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del turno"
        className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-sm max-md:max-w-[90vw] max-md:max-h-[90vh] max-md:overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">Turno</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>
          <div className="flex flex-col gap-4 p-6 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                {inicio && <p className="text-xs uppercase tracking-widest text-grafito/50">{formatDiaLargo(inicio)}</p>}
                <p className="mt-1 font-[family-name:var(--font-mono)] text-3xl font-semibold text-grafito">
                  {inicio && fin ? `${formatHora(inicio)}–${formatHora(fin)}` : "—"}
                </p>
              </div>
              {resuelto && (
                <span className="shrink-0 rounded-full border-[0.5px] border-arena px-2.5 py-1 text-xs font-medium text-grafito/60">
                  Resuelto
                </span>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-grafito/50">Paciente</p>
              <p className="mt-1 text-grafito">
                {turno.nombreContacto} {turno.apellidoContacto}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-grafito/50">Tipo de consulta</p>
              <p className="mt-1 flex items-center gap-2 text-grafito">
                {tipo && (
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: temaTipoConsulta(tipo).acento }} />
                )}
                {tipo?.nombre ?? "—"}
              </p>
            </div>
            {turno.motivo && (
              <div>
                <p className="text-xs uppercase tracking-widest text-grafito/50">Motivo</p>
                <p className="mt-1 text-grafito">{turno.motivo}</p>
              </div>
            )}
            {resuelto && (
              <div>
                <p className="text-xs uppercase tracking-widest text-grafito/50">Asistencia</p>
                {errorAsistencia && (
                  <p role="alert" className="mt-1 text-xs text-terracota-oscuro">
                    {errorAsistencia}
                  </p>
                )}
                {asistencia ? (
                  // Ya marcada — etiqueta fija, sin botones. Irreversible:
                  // no hay forma de volver a esto desde acá.
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        asistencia === "asistio" ? "bg-salvia-oscuro text-marfil" : "bg-terracota-oscuro text-marfil"
                      }`}
                    >
                      {asistencia === "asistio" ? "Asistió" : "Ausente"}
                    </span>
                    <span className="text-xs text-grafito/50">No se puede modificar.</span>
                  </p>
                ) : pidiendoConfirmar ? (
                  <div className="mt-1 flex flex-col gap-2">
                    <p role="alert" className="text-xs text-terracota-oscuro">
                      Esta elección es irreversible. ¿Confirmás que el paciente{" "}
                      {pidiendoConfirmar === "asistio" ? "asistió" : "estuvo ausente"}?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => confirmarAsistencia(pidiendoConfirmar)}
                        disabled={pendingAsistencia}
                        className="rounded-full bg-salvia-oscuro px-3 py-1.5 text-xs font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
                      >
                        {pendingAsistencia ? "Guardando…" : "Confirmar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPidiendoConfirmar(null)}
                        disabled={pendingAsistencia}
                        className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro disabled:opacity-60"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPidiendoConfirmar("asistio")}
                      className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                    >
                      Asistió
                    </button>
                    <button
                      type="button"
                      onClick={() => setPidiendoConfirmar("ausente")}
                      className="rounded-full border-[0.5px] border-arena px-3 py-1.5 text-xs font-medium text-grafito hover:border-terracota hover:text-terracota-oscuro"
                    >
                      Ausente
                    </button>
                  </div>
                )}
              </div>
            )}
            {enConflicto && !resuelto && (
              <p role="alert" className="rounded-field border-[0.5px] border-terracota bg-terracota-claro px-3 py-2 text-xs text-terracota-oscuro">
                Turno en conflicto con un horario reservado. Hablar con el paciente para acordar otro horario.
              </p>
            )}
            {/* Autoreservado (nueva función, pedido textual del cliente,
                2026-09-08): "cuando tocas la tarjeta informar que es
                autoreservado" — se pinta con rayas en el calendario (ver
                calendar-grid.tsx) y este es el aviso al tocarla. Tono
                informativo (salvia), no de advertencia (terracota) — el
                movimiento ya se hizo, no hay nada pendiente de resolver. */}
            {turno.autoreservado && (
              <p className="rounded-field border-[0.5px] border-salvia bg-salvia-claro px-3 py-2 text-xs text-salvia-oscuro">
                Este turno fue reprogramado automáticamente con &ldquo;Autoreservar turnos&rdquo;.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 border-t-[0.5px] border-arena pt-4">
              <Link
                href={hrefVerTurno}
                className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                Ver turno →
              </Link>
              {turno.pacienteId && (
                <Link
                  href={`/panel/pacientes/${turno.pacienteId}`}
                  className="rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                >
                  Ver paciente →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
