"use client";

import { useEffect, useRef, useState } from "react";
import type { BloqueoHorario, HorarioAtencion, TipoConsulta } from "@dental-mirage/shared-types";
import {
  eliminarBloqueoAction,
  eliminarHorarioAtencionAction,
  eliminarTipoConsultaAction,
  listBloqueosAction,
  listHorarioAtencionAction,
  listTiposConsultaAction,
  putHorarioAtencionGeneralAction,
} from "@/app/actions/calendario-config";
import { ModalPortal } from "./modal-portal";
import { AgregarReglaModal } from "./agregar-regla-modal";
import { AgregarHorarioAtencionModal, ALCANCE_LABEL_EXCEPCION } from "./agregar-horario-atencion-modal";
import { TipoConsultaFormModal } from "./tipo-consulta-form-modal";

interface ConfiguracionCalendarioModalProps {
  onClose: () => void;
  // "Ver regla" desde un bloqueo del calendario (F2.3.8, bloqueo-detalle-modal.tsx)
  // — el id de la regla a la que hay que llevar la vista apenas cargan
  // las tablas: scrollea hasta ella y la resalta un momento.
  reglaAFocalizarId?: string;
}

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ALCANCE_LABEL: Record<string, string> = {
  semana: "Esta semana",
  proxima_semana: "Próxima semana",
  mes: "Este mes",
  proximo_mes: "Próximo mes",
  todos: "Todos los meses",
};

// ConfiguracionCalendarioModal — F2.3.5-F2.3.7 (docs/implementation-plan.md
// §11.3), abierta desde el ícono de tuerca junto al título "Calendario"
// (ver calendar-view.tsx). Mismo patrón visual que "Agregar turno"
// (ModalPortal, backdrop con blur) — pedido explícito del cliente: "este
// será del mismo tipo que los div que se generan cuando aprieto por
// ejemplo el botón de agregar turno".
export function ConfiguracionCalendarioModal({ onClose, reglaAFocalizarId }: ConfiguracionCalendarioModalProps) {
  const [horarioGeneral, setHorarioGeneral] = useState<HorarioAtencion | null>(null);
  const [horarioError, setHorarioError] = useState<string | null>(null);
  const [guardandoHorario, setGuardandoHorario] = useState(false);
  // Excepciones temporales (corrección de QA, 2026-09-01: "puede que un
  // profesional tenga horarios de atención variable") — CRUD aparte del
  // form simple de la general, mismo patrón alta/edición que `agregando`
  // de los horarios reservados un poco más abajo.
  const [excepciones, setExcepciones] = useState<HorarioAtencion[] | null>(null);
  const [agregandoExcepcion, setAgregandoExcepcion] = useState<HorarioAtencion | "nuevo" | null>(null);

  const [generales, setGenerales] = useState<BloqueoHorario[] | null>(null);
  const [especificas, setEspecificas] = useState<BloqueoHorario[] | null>(null);
  // Un solo estado para alta Y edición (corrección de QA, F2.3.6): sin
  // `regla`, es un alta nueva; con `regla`, AgregarReglaModal precarga
  // sus valores y guarda con PATCH en vez de POST.
  const [agregando, setAgregando] = useState<{ especifico: boolean; regla?: BloqueoHorario } | null>(null);

  const [tiposConsulta, setTiposConsulta] = useState<TipoConsulta[] | null>(null);
  const [editandoTipo, setEditandoTipo] = useState<TipoConsulta | "nuevo" | null>(null);
  const [errorTipo, setErrorTipo] = useState<string | null>(null);

  const filaFocalizadaRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    let activo = true;
    listHorarioAtencionAction().then(([general, ...resto]) => {
      if (activo) {
        setHorarioGeneral(general ?? null);
        setExcepciones(resto);
      }
    });
    listBloqueosAction(false).then((lista) => {
      if (activo) setGenerales(lista);
    });
    listBloqueosAction(true).then((lista) => {
      if (activo) setEspecificas(lista);
    });
    listTiposConsultaAction().then((lista) => {
      if (activo) setTiposConsulta(lista);
    });
    return () => {
      activo = false;
    };
  }, []);

  // Scrollea hasta la regla pedida por "Ver regla" apenas está disponible
  // en el DOM (las dos tablas ya cargaron) — se activa una sola vez por
  // cada id nuevo, no en cada render.
  useEffect(() => {
    if (!reglaAFocalizarId || !filaFocalizadaRef.current) return;
    filaFocalizadaRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [reglaAFocalizarId, generales, especificas]);

  async function guardarHorarioGeneral(e: React.FormEvent) {
    e.preventDefault();
    if (!horarioGeneral?.horaDesde || !horarioGeneral?.horaHasta) return;
    setHorarioError(null);
    if (horarioGeneral.horaHasta <= horarioGeneral.horaDesde) {
      setHorarioError("La hora de fin debe ser posterior a la de inicio.");
      return;
    }
    setGuardandoHorario(true);
    const result = await putHorarioAtencionGeneralAction({ horaDesde: horarioGeneral.horaDesde, horaHasta: horarioGeneral.horaHasta });
    setGuardandoHorario(false);
    if ("error" in result) {
      setHorarioError(result.error);
      return;
    }
    setHorarioGeneral(result.horario);
  }

  function excepcionGuardada(horario: HorarioAtencion) {
    setExcepciones((actual) => {
      const lista = actual ?? [];
      const existe = lista.some((h) => h.id === horario.id);
      return existe ? lista.map((h) => (h.id === horario.id ? horario : h)) : [...lista, horario];
    });
    setAgregandoExcepcion(null);
  }

  async function eliminarExcepcion(id: string) {
    const result = await eliminarHorarioAtencionAction(id);
    if ("error" in result) return;
    setExcepciones((actual) => actual?.filter((h) => h.id !== id) ?? null);
  }

  async function eliminarRegla(id: string, lista: "general" | "especifica") {
    const result = await eliminarBloqueoAction(id);
    if ("error" in result) return;
    if (lista === "general") {
      setGenerales((actual) => actual?.filter((b) => b.id !== id) ?? null);
    } else {
      setEspecificas((actual) => actual?.filter((b) => b.id !== id) ?? null);
    }
  }

  function reemplazarOAgregar(lista: BloqueoHorario[], bloqueo: BloqueoHorario): BloqueoHorario[] {
    const existe = lista.some((b) => b.id === bloqueo.id);
    return existe ? lista.map((b) => (b.id === bloqueo.id ? bloqueo : b)) : [...lista, bloqueo];
  }

  function reglaGuardada(bloqueo: BloqueoHorario) {
    if (bloqueo.especifico) {
      setEspecificas((actual) => reemplazarOAgregar(actual ?? [], bloqueo));
    } else {
      setGenerales((actual) => reemplazarOAgregar(actual ?? [], bloqueo));
    }
    setAgregando(null);
  }

  function tipoGuardado(tipo: TipoConsulta) {
    setTiposConsulta((actual) => {
      const lista = actual ?? [];
      const existe = lista.some((t) => t.id === tipo.id);
      return existe ? lista.map((t) => (t.id === tipo.id ? tipo : t)) : [...lista, tipo];
    });
    setEditandoTipo(null);
  }

  async function eliminarTipo(id: string) {
    setErrorTipo(null);
    const result = await eliminarTipoConsultaAction(id);
    if ("error" in result) {
      setErrorTipo(result.error);
      return;
    }
    setTiposConsulta((actual) => actual?.filter((t) => t.id !== id) ?? null);
  }

  return (
    <ModalPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configuración de calendario"
        className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* bg-marfil — vuelta atrás (pedido explícito del cliente,
            2026-08-30): había pasado a bg-hueso para probar el mismo
            beige del resto de la página, pero se pidió volver al blanco
            de siempre, mismo criterio que el resto de los modales del
            panel. */}
        <div className="flex max-h-[90vh] w-full max-w-2xl max-md:max-w-[90vw] flex-col overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Configuración de calendario</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>

          <div className="flex flex-col gap-8 p-6">
            {/* Horario de atención — la general, aplica a todos los días
                salvo que una excepción temporal la tape (F2.3.2,
                rediseño 2026-09-01, corrección de QA: "puede que un
                profesional tenga horarios de atención variable"). */}
            <section className="flex flex-col gap-3">
              <h3 className="font-semibold text-grafito">Horario de atención</h3>
              {horarioGeneral === null ? (
                <p className="text-sm text-grafito/60">Cargando…</p>
              ) : (
                <form onSubmit={guardarHorarioGeneral} className="flex flex-wrap items-end gap-4">
                  <Campo label="Desde">
                    <input
                      type="time"
                      value={horarioGeneral.horaDesde ?? ""}
                      onChange={(e) => setHorarioGeneral({ ...horarioGeneral, horaDesde: e.target.value })}
                      className={inputClass}
                    />
                  </Campo>
                  <Campo label="Hasta">
                    <input
                      type="time"
                      value={horarioGeneral.horaHasta ?? ""}
                      onChange={(e) => setHorarioGeneral({ ...horarioGeneral, horaHasta: e.target.value })}
                      className={inputClass}
                    />
                  </Campo>
                  <button
                    type="submit"
                    disabled={guardandoHorario}
                    className="rounded-full bg-salvia-oscuro px-5 py-2 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
                  >
                    {guardandoHorario ? "Guardando…" : "Guardar"}
                  </button>
                </form>
              )}
              {horarioError && (
                <p role="alert" className="text-sm text-terracota-oscuro">
                  {horarioError}
                </p>
              )}
            </section>

            {/* Excepciones de horario de atención (corrección de QA,
                2026-09-01): "puede que un profesional tenga horarios de
                atención variable... esta semana/este mes/después de este
                estará de qué día a qué día" — mientras esté vigente,
                tapa a la general (rango > semana > mes > general, mismo
                criterio que bloqueos_horario). Una sin horario ("no
                trabaja") deja ese período sin nada que ofrecer en
                /disponibilidad. */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-grafito">Excepciones de horario</h3>
                <button
                  type="button"
                  onClick={() => setAgregandoExcepcion("nuevo")}
                  className="rounded-full bg-salvia-oscuro px-4 py-1.5 text-sm font-semibold text-marfil hover:brightness-95"
                >
                  {/* "+ Excepción" (corrección de QA, 2026-09-06): antes
                      "+ Agregar excepción" — muy grande en mobile. Acortado
                      solo acá, adentro de Configuración de calendario; los
                      accesos rápidos del calendario ("+ Agregar turno"/
                      "+ Reservar horario") quedan como estaban. */}
                  + Excepción
                </button>
              </div>
              <p className="text-xs text-grafito/60">
                Para un horario distinto al de siempre — esta semana, este mes, o un rango de fechas elegido a mano. También sirve
                para marcar un período sin atención.
              </p>
              <ExcepcionesHorarioTable
                excepciones={excepciones}
                onEditar={(h) => setAgregandoExcepcion(h)}
                onEliminar={eliminarExcepcion}
              />
            </section>

            {/* Horarios reservados generales (nombre pedido por el
                cliente, 2026-08-30 — antes "Reglas globales") — aplican a
                un rango amplio (esta semana, este mes, todos los meses);
                pierden contra un horario reservado específico que se
                solape (TR-084 en docs/tradeoffs.md). */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-grafito">Horarios reservados generales</h3>
                <button
                  type="button"
                  onClick={() => setAgregando({ especifico: false })}
                  className="rounded-full bg-salvia-oscuro px-4 py-1.5 text-sm font-semibold text-marfil hover:brightness-95"
                >
                  {/* "+ Horario" (corrección de QA, 2026-09-06): antes
                      "+ Agregar horario reservado" — muy grande en mobile. */}
                  + Horario
                </button>
              </div>
              <p className="text-xs text-grafito/60">
                Se repiten por día de la semana, en un rango amplio: esta semana, este mes, o todos los meses.
              </p>
              <ReglasTable
                reglas={generales}
                especifico={false}
                vacioMensaje="Todavía no cargaste ningún horario reservado general."
                reglaAFocalizarId={reglaAFocalizarId}
                filaFocalizadaRef={filaFocalizadaRef}
                onEditar={(r) => setAgregando({ especifico: false, regla: r })}
                onEliminar={(id) => eliminarRegla(id, "general")}
              />
            </section>

            {/* Horarios reservados específicos (nombre pedido por el
                cliente, 2026-08-30 — antes "Reglas específicas") — un día
                concreto, ganan sobre cualquier horario reservado general
                que se solape ese mismo día/horario. */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-grafito">Horarios reservados específicos</h3>
                <button
                  type="button"
                  onClick={() => setAgregando({ especifico: true })}
                  className="rounded-full bg-salvia-oscuro px-4 py-1.5 text-sm font-semibold text-marfil hover:brightness-95"
                >
                  {/* "+ Horario" — ver el comentario en la sección de
                      horarios reservados generales, arriba. */}
                  + Horario
                </button>
              </div>
              <p className="text-xs text-grafito/60">
                Aplican a un día puntual — si se solapan con un horario reservado general, gana el específico.
              </p>
              <ReglasTable
                reglas={especificas}
                especifico={true}
                vacioMensaje="Todavía no cargaste ningún horario reservado específico."
                reglaAFocalizarId={reglaAFocalizarId}
                filaFocalizadaRef={filaFocalizadaRef}
                onEditar={(r) => setAgregando({ especifico: true, regla: r })}
                onEliminar={(id) => eliminarRegla(id, "especifica")}
              />
            </section>

            {/* Tipos de consulta (F2.3.7): color, duración, tiempo
                post-consulta y cantidad de sesiones — antes solo se
                podían ver (GET /tipos-consulta), no gestionar. */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-grafito">Tipos de consulta</h3>
                <button
                  type="button"
                  onClick={() => setEditandoTipo("nuevo")}
                  className="rounded-full bg-salvia-oscuro px-4 py-1.5 text-sm font-semibold text-marfil hover:brightness-95"
                >
                  + Agregar tipo
                </button>
              </div>
              {tiposConsulta === null ? (
                <p className="text-sm text-grafito/60">Cargando…</p>
              ) : tiposConsulta.length === 0 ? (
                <p className="text-sm text-grafito/60">Todavía no cargaste ningún tipo de consulta.</p>
              ) : (
                // Organizado en tabla, mismo criterio visual que las
                // reglas globales/específicas de arriba (corrección de
                // QA) — antes era una lista de tarjetas suelta, distinta
                // del resto del modal. max-h-64 + overflow-auto: mismo
                // motivo que ReglasTable, "que no se agrande la página".
                <div className="max-h-64 overflow-auto rounded-card border-[0.5px] border-arena">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="sticky top-0 border-b-[0.5px] border-arena bg-hueso text-xs font-semibold uppercase tracking-wide text-grafito/60">
                        <th className="whitespace-nowrap px-4 py-2">Nombre</th>
                        <th className="whitespace-nowrap px-4 py-2">Duración</th>
                        <th className="whitespace-nowrap px-4 py-2">Post-consulta</th>
                        <th className="whitespace-nowrap px-4 py-2">Sesiones</th>
                        {/* hidden md:table-cell (corrección de QA,
                            2026-08-30: "se forma un gap blanco que queda
                            mal") — esta columna de acciones no se ve en
                            mobile (las acciones viven en la fila
                            desplegable de abajo), pero un <th> vacío
                            SIN ocultar seguía reservándole ancho a la
                            columna en la fila de encabezado, dejando una
                            franja blanca a la derecha en todas las
                            filas. */}
                        <th className="hidden px-4 py-2 md:table-cell" />
                      </tr>
                    </thead>
                    <tbody>
                      {tiposConsulta.map((t) => (
                        <FilaTipoConsulta key={t.id} tipo={t} onEditar={() => setEditandoTipo(t)} onEliminar={() => eliminarTipo(t.id)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {errorTipo && (
                <p role="alert" className="text-sm text-terracota-oscuro">
                  {errorTipo}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>

      {agregando && (
        <AgregarReglaModal
          especifico={agregando.especifico}
          reglaExistente={agregando.regla}
          onClose={() => setAgregando(null)}
          onGuardada={reglaGuardada}
        />
      )}

      {editandoTipo && (
        <TipoConsultaFormModal
          tipoExistente={editandoTipo === "nuevo" ? undefined : editandoTipo}
          onClose={() => setEditandoTipo(null)}
          onGuardado={tipoGuardado}
        />
      )}

      {agregandoExcepcion && (
        <AgregarHorarioAtencionModal
          horarioExistente={agregandoExcepcion === "nuevo" ? undefined : agregandoExcepcion}
          onClose={() => setAgregandoExcepcion(null)}
          onGuardado={excepcionGuardada}
        />
      )}
    </ModalPortal>
  );
}

// ExcepcionesHorarioTable — una fila por excepción temporal de horario de
// atención (corrección de QA, 2026-09-01), mismo criterio visual y de
// "tocar para desplegar acciones hacia abajo en mobile" que ReglasTable
// más abajo.
function ExcepcionesHorarioTable({
  excepciones,
  onEditar,
  onEliminar,
}: {
  excepciones: HorarioAtencion[] | null;
  onEditar: (horario: HorarioAtencion) => void;
  onEliminar: (id: string) => void;
}) {
  if (excepciones === null) {
    return <p className="text-sm text-grafito/60">Cargando…</p>;
  }
  if (excepciones.length === 0) {
    return <p className="text-sm text-grafito/60">Todavía no cargaste ninguna excepción de horario.</p>;
  }

  return (
    <div className="max-h-64 overflow-auto rounded-card border-[0.5px] border-arena">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="sticky top-0 border-b-[0.5px] border-arena bg-hueso text-xs font-semibold uppercase tracking-wide text-grafito/60">
            <th className="whitespace-nowrap px-4 py-2">Alcance</th>
            <th className="whitespace-nowrap px-4 py-2">Vigencia</th>
            <th className="whitespace-nowrap px-4 py-2">Horario</th>
            <th className="hidden px-4 py-2 md:table-cell" />
          </tr>
        </thead>
        <tbody>
          {excepciones.map((h) => (
            <FilaExcepcionHorario key={h.id} horario={h} onEditar={() => onEditar(h)} onEliminar={() => onEliminar(h.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaExcepcionHorario({
  horario: h,
  onEditar,
  onEliminar,
}: {
  horario: HorarioAtencion;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const [desplegada, setDesplegada] = useState(false);

  return (
    <>
      <tr
        onClick={() => setDesplegada((actual) => !actual)}
        className={`cursor-pointer border-b-[0.5px] border-arena last:border-b-0 hover:bg-hueso md:cursor-default ${
          desplegada ? "bg-hueso" : ""
        }`}
      >
        <td className="px-4 py-2 text-grafito">{ALCANCE_LABEL_EXCEPCION[h.alcance] ?? h.alcance}</td>
        <td className="px-4 py-2 text-grafito/70">{h.fechaDesde && h.fechaHasta ? `${h.fechaDesde} – ${h.fechaHasta}` : "—"}</td>
        <td className="px-4 py-2 font-[family-name:var(--font-mono)] text-grafito">
          {h.horaDesde && h.horaHasta ? `${h.horaDesde}–${h.horaHasta}` : "No trabaja"}
        </td>
        <td className="hidden px-4 py-2 text-right md:table-cell">
          <div className="flex justify-end gap-3">
            <AccionesFila
              onEditar={onEditar}
              onEliminar={onEliminar}
              labelEditar="Editar excepción de horario"
              labelEliminar="Eliminar excepción de horario"
              variante="desktop"
            />
          </div>
        </td>
      </tr>
      {desplegada && (
        <tr className="border-b-[0.5px] border-arena bg-hueso last:border-b-0 md:hidden">
          <td colSpan={4} className="px-4 py-2">
            <div className="flex flex-wrap justify-start gap-3">
              <AccionesFila
                onEditar={onEditar}
                onEliminar={onEliminar}
                labelEditar="Editar excepción de horario"
                labelEliminar="Eliminar excepción de horario"
                variante="mobile"
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ReglasTable({
  reglas,
  especifico,
  vacioMensaje,
  reglaAFocalizarId,
  filaFocalizadaRef,
  onEditar,
  onEliminar,
}: {
  reglas: BloqueoHorario[] | null;
  especifico: boolean;
  vacioMensaje: string;
  reglaAFocalizarId?: string;
  filaFocalizadaRef: React.RefObject<HTMLTableRowElement | null>;
  onEditar: (regla: BloqueoHorario) => void;
  onEliminar: (id: string) => void;
}) {
  if (reglas === null) {
    return <p className="text-sm text-grafito/60">Cargando…</p>;
  }
  if (reglas.length === 0) {
    return <p className="text-sm text-grafito/60">{vacioMensaje}</p>;
  }

  return (
    // max-h-64 + overflow-y-auto (corrección de QA): "agregar un
    // scrollbar cuando se acumulen muchos [registros], así no se agranda
    // la página" — antes la tabla crecía sin límite y empujaba todo el
    // modal (que ya tiene su propio scroll general) cada vez más largo.
    <div className="max-h-64 overflow-auto rounded-card border-[0.5px] border-arena">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="sticky top-0 border-b-[0.5px] border-arena bg-hueso text-xs font-semibold uppercase tracking-wide text-grafito/60">
            <th className="whitespace-nowrap px-4 py-2">{especifico ? "Fecha" : "Día"}</th>
            {!especifico && <th className="whitespace-nowrap px-4 py-2">Alcance</th>}
            <th className="whitespace-nowrap px-4 py-2">Horario</th>
            <th className="whitespace-nowrap px-4 py-2">Motivo</th>
            {/* hidden md:table-cell — ver el comentario igual en la tabla
                de Tipos de consulta más abajo. */}
            <th className="hidden px-4 py-2 md:table-cell" />
          </tr>
        </thead>
        <tbody>
          {reglas.map((r) => (
            <FilaRegla
              key={r.id}
              regla={r}
              especifico={especifico}
              focalizada={r.id === reglaAFocalizarId}
              filaFocalizadaRef={filaFocalizadaRef}
              onEditar={onEditar}
              onEliminar={onEliminar}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// FilaRegla — una fila por regla, con sus propias acciones (Editar/
// Eliminar). En mobile arrancan ocultas: "en mobile al tocar sobre la
// regla se podrá ver el editar o eliminar" (pedido explícito del
// cliente) — tocar la fila las despliega HACIA ABAJO, en una segunda
// fila propia (no hacia el costado — corrección de QA, 2026-08-30: "el
// desplegable... sigue siendo hacia el costado, no hacia abajo como se
// había dicho"), igual criterio que TurnosTable (turnos-table.tsx).
// Desde `md` los botones siempre quedan visibles en la fila principal,
// sin tocar nada; la fila de abajo nunca aparece ahí (`md:hidden`) — no
// hace falta, es una mejora exclusiva de mobile.
function FilaRegla({
  regla: r,
  especifico,
  focalizada,
  filaFocalizadaRef,
  onEditar,
  onEliminar,
}: {
  regla: BloqueoHorario;
  especifico: boolean;
  focalizada: boolean;
  filaFocalizadaRef: React.RefObject<HTMLTableRowElement | null>;
  onEditar: (regla: BloqueoHorario) => void;
  onEliminar: (id: string) => void;
}) {
  const [desplegada, setDesplegada] = useState(false);
  // Cantidad total de columnas de la tabla (ver el <thead> más abajo) —
  // la fila de acciones desplegada en mobile ocupa todo el ancho.
  const colSpan = especifico ? 4 : 5;

  return (
    <>
      <tr
        ref={focalizada ? filaFocalizadaRef : undefined}
        onClick={() => setDesplegada((actual) => !actual)}
        className={`cursor-pointer border-b-[0.5px] border-arena last:border-b-0 hover:bg-hueso md:cursor-default ${
          focalizada ? "bg-salvia-claro" : desplegada ? "bg-hueso" : ""
        } ${desplegada ? "" : "md:border-b-[0.5px]"}`}
      >
        <td className="px-4 py-2 text-grafito">
          {especifico ? r.fecha : r.diaSemana !== undefined ? DIAS_SEMANA[r.diaSemana] : "—"}
        </td>
        {!especifico && <td className="px-4 py-2 text-grafito">{r.alcance ? ALCANCE_LABEL[r.alcance] : "—"}</td>}
        <td className="px-4 py-2 font-[family-name:var(--font-mono)] text-grafito">
          {r.horaDesde}–{r.horaHasta}
        </td>
        <td className="px-4 py-2 text-grafito/70">{r.motivo || "—"}</td>
        <td className="hidden px-4 py-2 text-right md:table-cell">
          <div className="flex justify-end gap-3">
            <AccionesFila
              onEditar={() => onEditar(r)}
              onEliminar={() => onEliminar(r.id)}
              labelEditar="Editar horario reservado"
              labelEliminar="Eliminar horario reservado"
              variante="desktop"
            />
          </div>
        </td>
      </tr>
      {desplegada && (
        <tr className="border-b-[0.5px] border-arena bg-hueso last:border-b-0 md:hidden">
          {/* justify-start (corrección de QA, 2026-08-30: "los botones
              tienen que estar a la izquierda") — esta fila es angosta y
              propia (no comparte columnas con la fila principal), no
              hace falta alinearla a la derecha como el resto de la
              tabla. */}
          <td colSpan={colSpan} className="px-4 py-2">
            <div className="flex flex-wrap justify-start gap-3">
              <AccionesFila
                onEditar={() => onEditar(r)}
                onEliminar={() => onEliminar(r.id)}
                labelEditar="Editar horario reservado"
                labelEliminar="Eliminar horario reservado"
                variante="mobile"
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// FilaTipoConsulta — mismo criterio de "tocar para desplegar acciones
// HACIA ABAJO en mobile" que FilaRegla de arriba (pedido explícito del
// cliente, 2026-08-30: "sigue siendo hacia el costado, no hacia abajo
// como se había dicho").
function FilaTipoConsulta({
  tipo: t,
  onEditar,
  onEliminar,
}: {
  tipo: TipoConsulta;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const [desplegada, setDesplegada] = useState(false);

  return (
    <>
      <tr
        onClick={() => setDesplegada((actual) => !actual)}
        className={`cursor-pointer border-b-[0.5px] border-arena last:border-b-0 hover:bg-hueso md:cursor-default ${desplegada ? "bg-hueso" : ""}`}
      >
        <td className="px-4 py-2 text-grafito">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: t.color }} aria-hidden="true" />
            <span className="font-semibold">{t.nombre}</span>
          </span>
        </td>
        <td className="px-4 py-2 text-grafito">{t.duracionMinutos ?? "—"} min</td>
        <td className="px-4 py-2 text-grafito/70">{t.tiempoPostConsultaMinutos ? `${t.tiempoPostConsultaMinutos} min` : "—"}</td>
        <td className="px-4 py-2 text-grafito/70">{t.cantidadSesiones ?? "—"}</td>
        <td className="hidden px-4 py-2 text-right md:table-cell">
          <div className="flex justify-end gap-3">
            <AccionesFila
              onEditar={onEditar}
              onEliminar={onEliminar}
              labelEditar="Editar tipo de consulta"
              labelEliminar="Eliminar tipo de consulta"
              variante="desktop"
            />
          </div>
        </td>
      </tr>
      {desplegada && (
        <tr className="border-b-[0.5px] border-arena bg-hueso last:border-b-0 md:hidden">
          <td colSpan={5} className="px-4 py-2">
            <div className="flex flex-wrap justify-start gap-3">
              <AccionesFila
                onEditar={onEditar}
                onEliminar={onEliminar}
                labelEditar="Editar tipo de consulta"
                labelEliminar="Eliminar tipo de consulta"
                variante="mobile"
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// AccionesFila — Editar/Eliminar compartido por las tres tablas de este
// modal (horarios reservados, tipos de consulta, excepciones de horario)
// — pedido explícito del cliente (2026-09-05):
//   - "para eliminar un horario reservado te pide confirmacion ahora,
//     tambien para tipo de consulta, y excepciones" — Eliminar ya no
//     borra directo al primer click, pide confirmación inline (mismo
//     criterio que ya usa BloqueoDetalleModal para un horario específico
//     ya pasado, ver "Eliminar" ahí).
//   - "para mobile los botones de eliminar y editar del panel de
//     configuracion del calendario deben ser similares a los que se
//     manejan con turno, misma apariencia" — en mobile pasan a ser
//     pastillas con borde (mismo criterio que TurnosTable), en vez de
//     los links de texto simple que siguen usando las tres tablas en
//     escritorio (esa apariencia de escritorio no cambió, el pedido es
//     puntual de mobile).
function AccionesFila({
  onEditar,
  onEliminar,
  labelEditar,
  labelEliminar,
  variante,
}: {
  onEditar: () => void;
  onEliminar: () => void;
  labelEditar: string;
  labelEliminar: string;
  variante: "desktop" | "mobile";
}) {
  const [confirmando, setConfirmando] = useState(false);
  const mobile = variante === "mobile";

  if (confirmando) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-terracota-oscuro">¿Eliminar?</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEliminar();
            setConfirmando(false);
          }}
          className={
            mobile
              ? "rounded-full bg-terracota-oscuro px-3 py-1.5 text-xs font-semibold text-marfil hover:brightness-95"
              : "text-sm font-medium text-terracota-oscuro hover:brightness-90"
          }
        >
          Sí, eliminar
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmando(false);
          }}
          className={
            mobile
              ? "rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              : "text-sm font-medium text-grafito hover:text-grafito/70"
          }
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEditar();
        }}
        aria-label={labelEditar}
        className={
          mobile
            ? "rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
            : "text-sm font-medium text-salvia-oscuro hover:brightness-90"
        }
      >
        Editar
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmando(true);
        }}
        aria-label={labelEliminar}
        className={
          mobile
            ? "rounded-full border-[0.5px] border-terracota bg-marfil px-3 py-1.5 text-xs font-medium text-terracota-oscuro hover:bg-terracota-claro"
            : "text-sm font-medium text-terracota-oscuro hover:brightness-90"
        }
      >
        Eliminar
      </button>
    </span>
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
