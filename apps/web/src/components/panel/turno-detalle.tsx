"use client";

import Link from "next/link";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
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
// Asistencia — corrección de QA (rediseño del cartel de asistencia en
// tiempo real, `AsistenciaCartelGlobal`): "vamos a quitar todos los otros
// botones para poner ausente o presente fuera de esto [el cartel], por
// ejemplo... en la tarjeta del calendario". Este panel deja de tener
// forma de marcar asistencia — el cartel bloqueante ya se encarga de eso
// apenas se cumple la hora de fin, sin importar qué pantalla esté
// mirando el profesional. Acá solo queda la etiqueta de lectura, una vez
// que el cartel ya la marcó (irreversible, no hay forma de modificarla
// desde ningún lado).
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
                {turno.asistencia ? (
                  <p className="mt-1">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        turno.asistencia === "asistio" ? "bg-salvia-oscuro text-marfil" : "bg-terracota-oscuro text-marfil"
                      }`}
                    >
                      {turno.asistencia === "asistio" ? "Asistió" : "Ausente"}
                    </span>
                  </p>
                ) : (
                  // Sin marcar todavía — el cartel de confirmación
                  // (AsistenciaCartelGlobal) es la única forma de
                  // marcarlo, no hay botones acá.
                  <p className="mt-1 text-xs text-grafito/50">Pendiente de confirmar en el cartel de asistencia.</p>
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
