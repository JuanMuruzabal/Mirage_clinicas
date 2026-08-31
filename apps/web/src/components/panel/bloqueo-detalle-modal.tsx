"use client";

import { useState } from "react";
import type { BloqueoHorario, TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { eliminarBloqueoAction } from "@/app/actions/calendario-config";
import { fechaISOLocal, formatHora, horaISOLocal, hoyEnCordoba } from "@/lib/calendar-utils";
import { temaTipoConsulta } from "@/lib/turno-format";
import { ModalPortal } from "./modal-portal";

interface BloqueoDetalleModalProps {
  // `reglas` siempre es una lista (corrección de QA, 2026-08-31): un
  // solo elemento para un tramo sin solapamiento (detalle simple, como
  // siempre); dos o más para un tramo "combinado" — "que al tocar en el
  // centro muestre la combinación de horarios reservados... que muestre
  // los horarios de cada una y el botón para redirigirse a cada una, que
  // no dé aviso de solapamiento". Antes era un `bloqueo` singular más un
  // `otraReglaSolapada` opcional — ese diseño de "principal + aviso de
  // una sola regla de abajo" no escalaba a una tercera regla solapada.
  reglas: BloqueoHorario[];
  // turnos — agregado en el paso 2 (manejo de conflictos con turnos):
  // los turnos que caen en el mismo cluster que `reglas`. Vacío/ausente
  // en el detalle simple y en "combinado" sin conflicto; con uno o más
  // turnos, el modal agrega la sección de turnos además de la lista de
  // reglas de siempre. `tiposConsulta` solo hace falta para resolver el
  // color/nombre del tipo de cada turno — mismo dato que ya recibe
  // CalendarGrid.
  turnos?: Turno[];
  tiposConsulta?: TipoConsulta[];
  onClose: () => void;
  // onVerRegla recibe el id de la regla elegida — con una sola regla en
  // detalle simple hay un solo botón; en la combinación hay uno por
  // regla.
  onVerRegla: (reglaId: string) => void;
  // onVerTurno — solo se llama desde una tarjeta de turno; abre el mismo
  // TurnoDetalle de siempre (ver calendar-view.tsx), con el aviso de
  // conflicto agregado ahí si corresponde.
  onVerTurno?: (turno: Turno) => void;
  // onEliminada — pedido explícito del cliente (2026-09-04): "los
  // horarios específicos reservados pasado el tiempo al tocarlos desde el
  // calendario dar la opción de eliminarlos de ahí directamente" — avisa
  // al padre que una regla se borró de verdad, para que recargue
  // bloqueosGenerales/bloqueosEspecificas (mismo dato que ya recarga
  // ConfiguracionCalendarioModal al cerrarse).
  onEliminada?: () => void;
}

// turnoResuelto/reglaEspecificaPasada — mismos criterios derivados que ya
// usan calendar-grid.tsx (turnoResuelto) y TurnoDetalle/turnos-table.tsx:
// nunca un estado real en la base, se calculan acá mismo con la hora
// actual. reglaEspecificaPasada compara fecha+horaHasta completos (no
// solo la fecha calendario) contra "ahora en Córdoba" — HOY con un
// horario ya terminado también cuenta como pasado, mismo criterio que la
// validación de "no reservar en el pasado" al crear una regla.
function turnoResuelto(t: Turno): boolean {
  return Boolean(t.horaFin) && new Date(t.horaFin!).getTime() < Date.now();
}

function reglaEspecificaPasada(regla: BloqueoHorario): boolean {
  if (!regla.especifico || !regla.fecha) return false;
  const ahora = hoyEnCordoba();
  const hoy = fechaISOLocal(ahora);
  if (regla.fecha < hoy) return true;
  if (regla.fecha > hoy) return false;
  return regla.horaHasta <= horaISOLocal(ahora);
}

// BloqueoDetalleModal — F2.3.8 (docs/implementation-plan.md §11.3, pedido
// explícito del cliente): al tocar un tramo bloqueado del calendario,
// "muestre horario bloqueado de tal hora a tal hora... y abajo un
// botoncito que diga ver regla, que te lleva directamente a esta". Mismo
// patrón visual que los demás modales chicos (ej. CancelarTurnoModal) —
// centrado, backdrop con blur. Rediseño 2026-08-31 (ver "tipos de
// solapamiento.png" en docs/): con dos o más reglas solapadas, ya no hay
// una "principal" y un aviso de la otra por debajo — se listan todas por
// igual, cada una con su propio botón. Rediseño 2026-09-01, corrección
// de QA ("las tarjetas de horarios reservados ser más informativas"):
//   - Se saca el label "General"/"Específico" — no le sirve al
//     profesional para nada práctico acá, y "quiero... quitar lo que
//     dice general u específico" fue textual.
//   - Se saca también la línea de "tipo de regla" (siempre decía
//     "Bloquear horario": hoy es el ÚNICO valor que existe, así que esa
//     línea nunca aportaba información nueva — pura redundancia).
//   - El horario pasa a ser el elemento más grande de la tarjeta (antes
//     era una oración chica, "Bloqueado de X a Y"): es el dato que el
//     profesional necesita leer de un vistazo, tanto solo como
//     combinado.
// Paso 2 (manejo de conflictos con turnos, 2026-09-04): cuando el cluster
// incluye uno o más turnos, se agregan secciones aparte abajo de la lista
// de reglas — nunca mezclados en la misma lista, un turno no es una
// regla. "Turnos en conflicto" lista los que todavía no pasaron (con el
// aviso fijo de hablar con el paciente); "Turnos resueltos" los que ya
// pasaron sin que se haya hecho nada con la reserva — sin ese aviso, ya
// no hay nada urgente que resolver, solo un dato para consultar. Cada
// tarjeta de turno replica el formato de TurnoDetalle (hora grande,
// paciente, tipo de consulta con su color) y un botón "Ver turno" que
// abre TurnoDetalle de verdad (ver calendar-view.tsx) — cerrando este
// modal combinado primero. Las reglas ESPECÍFICAS ya pasadas ofrecen acá
// mismo un botón "Eliminar" (con confirmación inline) — "dado el caso de
// agendar algo con reserva y al final no hacer nada con eso", no hace
// falta ir hasta Configuración de calendario solo para descartarla.
export function BloqueoDetalleModal({
  reglas,
  turnos = [],
  tiposConsulta = [],
  onClose,
  onVerRegla,
  onVerTurno,
  onEliminada,
}: BloqueoDetalleModalProps) {
  // Con uno o más turnos en conflicto, SIEMPRE se usa la vista de lista
  // (aunque haya una sola regla) — es un cluster igual, solo que además
  // de una regla combina un turno; el detalle simple queda reservado a
  // una regla sola sin ningún conflicto.
  const combinado = reglas.length > 1 || turnos.length > 0;
  const tipoPorId = new Map(tiposConsulta.map((t) => [t.id, t]));
  const titulo = turnos.length > 0 ? "Horarios reservados y turnos" : combinado ? "Horarios reservados combinados" : "Horario bloqueado";

  const turnosEnConflicto = turnos.filter((t) => !turnoResuelto(t));
  const turnosResueltos = turnos.filter(turnoResuelto);

  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  async function eliminarRegla(reglaId: string) {
    setErrorEliminar(null);
    setPendingId(reglaId);
    const result = await eliminarBloqueoAction(reglaId);
    setPendingId(null);
    if ("error" in result) {
      setErrorEliminar(result.error);
      return;
    }
    onEliminada?.();
    onClose();
  }

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-medium text-grafito">{titulo}</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>

          {errorEliminar && (
            <p role="alert" className="text-sm text-terracota-oscuro">
              {errorEliminar}
            </p>
          )}

          {!combinado ? (
            <>
              <p className="font-[family-name:var(--font-mono)] text-3xl font-bold text-grafito">
                {reglas[0].horaDesde} – {reglas[0].horaHasta}
              </p>
              {reglas[0].motivo && <p className="text-sm text-grafito/70">{reglas[0].motivo}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onVerRegla(reglas[0].id)}
                  className="self-start rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                >
                  Ver horario reservado
                </button>
                <BotonEliminar
                  regla={reglas[0]}
                  confirmandoEliminarId={confirmandoEliminarId}
                  pendingId={pendingId}
                  onPedirConfirmar={setConfirmandoEliminarId}
                  onCancelar={() => setConfirmandoEliminarId(null)}
                  onConfirmar={eliminarRegla}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-grafito/60">Estos horarios reservados se solapan entre sí:</p>
              {/* max-h + overflow-y-auto (corrección de QA, 2026-09-03):
                  "si se superponen muchas cosas, se hace muy grande la
                  vista de los eventos" — con scroll propio en vez de
                  seguir creciendo, mismo criterio que ReglasTable en
                  configuracion-calendario-modal.tsx. Tarjetas más chicas
                  que antes (p-3 en vez de p-4, horario text-lg en vez de
                  text-xl) para que entren más "de un vistazo" antes de
                  necesitar scrollear — "hacer la vista un poco más chica
                  para agruparlos mejor". */}
              <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                {reglas.map((regla) => (
                  <div key={regla.id} className="rounded-field border-[0.5px] border-arena bg-hueso p-3">
                    <p className="font-[family-name:var(--font-mono)] text-lg font-bold text-grafito">
                      {regla.horaDesde} – {regla.horaHasta}
                    </p>
                    {regla.motivo && <p className="text-xs text-grafito/70">{regla.motivo}</p>}
                    <button
                      type="button"
                      onClick={() => onVerRegla(regla.id)}
                      className="mt-2 rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                    >
                      Ver este horario reservado
                    </button>
                    <BotonEliminar
                      regla={regla}
                      confirmandoEliminarId={confirmandoEliminarId}
                      pendingId={pendingId}
                      onPedirConfirmar={setConfirmandoEliminarId}
                      onCancelar={() => setConfirmandoEliminarId(null)}
                      onConfirmar={eliminarRegla}
                    />
                  </div>
                ))}
              </div>

              {/* Turnos en conflicto (paso 2, 2026-09-04) — solo los que
                  TODAVÍA no pasaron; sección APARTE, con su propio título
                  y su propio scroll (mismo criterio que la lista de
                  reglas de arriba): "un horario reservado que se solapa
                  con el turno o más... mostrará la tarjeta... con la
                  pista en el cuerpo x turnos en conflicto". Cada tarjeta
                  replica el formato de TurnoDetalle (hora grande,
                  paciente, tipo de consulta) y agrega el aviso fijo
                  pedido por el cliente: "turno en conflicto con un
                  horario reservado, hablar con el paciente para acordar
                  otro horario". */}
              {turnosEnConflicto.length > 0 && (
                <>
                  <p className="text-sm font-medium text-grafito">Turnos en conflicto</p>
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                    {turnosEnConflicto.map((turno) => (
                      <TarjetaTurno key={turno.id} turno={turno} tipo={turno.tipoConsultaId ? tipoPorId.get(turno.tipoConsultaId) : undefined} onVerTurno={onVerTurno}>
                        <p className="mt-2 rounded-field border-[0.5px] border-terracota bg-terracota-claro px-2 py-1.5 text-xs text-terracota-oscuro">
                          Turno en conflicto con un horario reservado. Hablar con el paciente para acordar otro horario.
                        </p>
                      </TarjetaTurno>
                    ))}
                  </div>
                </>
              )}

              {/* Turnos resueltos (2026-09-04, pedido explícito del
                  cliente): "que los turnos en conflicto con un horario
                  reservado pasen a resueltos... dado el caso de agendar
                  algo con reserva y al final no hacer nada con eso" — ya
                  no hay nada urgente que resolver, así que sin el aviso
                  de conflicto; el botón "Ver turno" sigue sirviendo para
                  marcar asistió/ausente desde ahí. */}
              {turnosResueltos.length > 0 && (
                <>
                  <p className="text-sm font-medium text-grafito">Turnos resueltos</p>
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                    {turnosResueltos.map((turno) => (
                      <TarjetaTurno key={turno.id} turno={turno} tipo={turno.tipoConsultaId ? tipoPorId.get(turno.tipoConsultaId) : undefined} onVerTurno={onVerTurno} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

function TarjetaTurno({
  turno,
  tipo,
  onVerTurno,
  children,
}: {
  turno: Turno;
  tipo?: TipoConsulta;
  onVerTurno?: (turno: Turno) => void;
  children?: React.ReactNode;
}) {
  const inicio = turno.horaInicio ? new Date(turno.horaInicio) : null;
  const fin = turno.horaFin ? new Date(turno.horaFin) : null;
  return (
    <div className="rounded-field border-[0.5px] border-arena bg-hueso p-3">
      <p className="font-[family-name:var(--font-mono)] text-lg font-bold text-grafito">
        {inicio && fin ? `${formatHora(inicio)} – ${formatHora(fin)}` : "—"}
      </p>
      <p className="text-xs text-grafito/70">
        {turno.nombreContacto} {turno.apellidoContacto}
      </p>
      {tipo && (
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-grafito/70">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: temaTipoConsulta(tipo).acento }} />
          {tipo.nombre}
        </p>
      )}
      {children}
      <button
        type="button"
        onClick={() => onVerTurno?.(turno)}
        className="mt-2 rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
      >
        Ver turno
      </button>
    </div>
  );
}

// BotonEliminar — "los horarios específicos reservados pasado el tiempo
// al tocarlos desde el calendario dar la opción de eliminarlos de ahí
// directamente" (2026-09-04). No renderiza nada para una general, ni para
// una específica que todavía no pasó (ver reglaEspecificaPasada). Estado
// de confirmación (`confirmandoEliminarId`/`pendingId`) vive en el padre
// — declarado a nivel de módulo (no adentro de BloqueoDetalleModal) para
// no recrear el componente en cada render, cosa que reseteaba su estado
// local en cada tecla/click ajeno.
function BotonEliminar({
  regla,
  confirmandoEliminarId,
  pendingId,
  onPedirConfirmar,
  onCancelar,
  onConfirmar,
}: {
  regla: BloqueoHorario;
  confirmandoEliminarId: string | null;
  pendingId: string | null;
  onPedirConfirmar: (reglaId: string) => void;
  onCancelar: () => void;
  onConfirmar: (reglaId: string) => void;
}) {
  if (!reglaEspecificaPasada(regla)) return null;
  if (confirmandoEliminarId === regla.id) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-terracota-oscuro">¿Eliminar este horario reservado?</span>
        <button
          type="button"
          onClick={() => onConfirmar(regla.id)}
          disabled={pendingId === regla.id}
          className="rounded-full bg-terracota-oscuro px-3 py-1 text-xs font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
        >
          {pendingId === regla.id ? "Eliminando…" : "Sí, eliminar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-full border-[0.5px] border-arena px-3 py-1 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
        >
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPedirConfirmar(regla.id)}
      className="mt-2 ml-2 rounded-full border-[0.5px] border-terracota bg-marfil px-3 py-1 text-xs font-medium text-terracota-oscuro hover:bg-terracota-claro"
    >
      Eliminar
    </button>
  );
}
