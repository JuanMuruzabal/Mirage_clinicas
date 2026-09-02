"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AutoreservarResultadoItem, BloqueoHorario, TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { eliminarBloqueoAction } from "@/app/actions/calendario-config";
import { autoreservarTurnosAction } from "@/app/actions/turnos";
import { fechaISOLocal, formatHora, horaISOLocal, hoyEnCordoba } from "@/lib/calendar-utils";
import { formatFechaHora, temaTipoConsulta } from "@/lib/turno-format";
import { esExcepcionSintetica } from "./calendar-grid";
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
  // onReprogramados — nueva función (pedido textual del cliente,
  // 2026-09-08): avisa al padre (calendar-view.tsx) que uno o más turnos
  // se movieron con "Autoreservar turnos", para que vuelva a pedir los
  // turnos del rango visible — este modal ya tiene el resultado que
  // necesita para la pantalla de confirmación, así que no depende de que
  // el padre le pase turnos actualizados.
  onReprogramados?: () => void;
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
  onReprogramados,
}: BloqueoDetalleModalProps) {
  // Con uno o más turnos en conflicto, SIEMPRE se usa la vista de lista
  // (aunque haya una sola regla) — es un cluster igual, solo que además
  // de una regla combina un turno; el detalle simple queda reservado a
  // una regla sola sin ningún conflicto.
  const combinado = reglas.length > 1 || turnos.length > 0;
  const tipoPorId = new Map(tiposConsulta.map((t) => [t.id, t]));

  const turnosEnConflicto = turnos.filter((t) => !turnoResuelto(t));
  const turnosResueltos = turnos.filter(turnoResuelto);

  const [confirmandoEliminarId, setConfirmandoEliminarId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  // Autoreservar turnos (nueva función, pedido textual del cliente,
  // 2026-09-08): "dar un botón de autoreservar turno para los
  // afectados... después mostrará una pantalla que dice el turno x
  // horario viejo -> turno x horario nuevo y un botón de informar
  // afectados". `resultadosAutoreserva` no nulo reemplaza el cuerpo del
  // modal por esa pantalla de confirmación — no hace falta un `vista`
  // aparte, la sola presencia del resultado ya decide qué mostrar.
  const [autoreservando, setAutoreservando] = useState(false);
  const [errorAutoreservar, setErrorAutoreservar] = useState<string | null>(null);
  const [resultadosAutoreserva, setResultadosAutoreserva] = useState<AutoreservarResultadoItem[] | null>(null);

  const titulo = resultadosAutoreserva
    ? "Turnos reprogramados"
    : turnos.length > 0
      ? "Horarios reservados y turnos"
      : combinado
        ? "Horarios reservados combinados"
        : "Horario bloqueado";

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

  async function autoreservarTurnos() {
    setErrorAutoreservar(null);
    setAutoreservando(true);
    const result = await autoreservarTurnosAction(turnosEnConflicto.map((t) => t.id));
    setAutoreservando(false);
    if ("error" in result) {
      setErrorAutoreservar(result.error);
      return;
    }
    setResultadosAutoreserva(result.resultados);
    onReprogramados?.();
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
        {/* max-h-[90vh] + overflow-y-auto en el contenedor ENTERO
            (corrección de QA, 2026-09-08, foto "solapamiento_+3horarios"):
            las listas de adentro (reglas/turnos en conflicto/resueltos) ya
            tenían su propio scroll acotado (max-h-72 cada una), pero la
            ventana en sí no tenía ningún techo — con 3+ turnos en
            conflicto, título + reglas + aviso + las tres secciones
            apiladas superaban el alto de la pantalla igual, sobre todo en
            mobile. Mismo patrón ya usado en agregar-turno-modal.tsx/
            editar-turno-modal.tsx/configuracion-calendario-modal.tsx. */}
        <div className="flex max-h-[90vh] w-full max-w-sm max-md:max-w-[90vw] flex-col gap-4 overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil p-6 shadow-soft">
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

          {resultadosAutoreserva ? (
            <PantallaConfirmacionAutoreserva resultados={resultadosAutoreserva} />
          ) : !combinado ? (
            <>
              <p className="font-[family-name:var(--font-mono)] text-3xl font-bold text-grafito">
                {reglas[0].horaDesde} – {reglas[0].horaHasta}
              </p>
              {reglas[0].motivo && <p className="text-sm text-grafito/70">{reglas[0].motivo}</p>}
              {/* Excepción de horario de atención sintética (nueva
                  función, corrección de QA 2026-09-08: "agregar botón de
                  ver excepción de horario al tocar la tarjeta de horario
                  de excepción en el calendario") — al hacer click en una
                  tarjeta "No trabajo en este período" sola (sin nada real
                  de por medio, ver calendar-grid.tsx), llega acá con una
                  única regla sintética. "Ver..." sigue funcionando
                  (onVerRegla ya sabe resolver el id sintético a la fila
                  real en Configuración de calendario, ver
                  calendar-view.tsx), solo cambia la etiqueta del botón;
                  "Eliminar" sí se oculta — una excepción se borra desde
                  Configuración de calendario, no hay un endpoint de
                  bloqueo real detrás de este id. */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onVerRegla(reglas[0].id)}
                  className="self-start rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                >
                  {esExcepcionSintetica(reglas[0]) ? "Ver excepción de horario" : "Ver horario reservado"}
                </button>
                {!esExcepcionSintetica(reglas[0]) && (
                  <BotonEliminar
                    regla={reglas[0]}
                    confirmandoEliminarId={confirmandoEliminarId}
                    pendingId={pendingId}
                    onPedirConfirmar={setConfirmandoEliminarId}
                    onCancelar={() => setConfirmandoEliminarId(null)}
                    onConfirmar={eliminarRegla}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-grafito/60">Estos horarios reservados se solapan entre sí:</p>
              <ScrollDeUnaTarjeta
                items={reglas.map((regla) => ({
                  id: regla.id,
                  contenido: (
                    <div className="rounded-field border-[0.5px] border-arena bg-hueso p-3">
                      <p className="font-[family-name:var(--font-mono)] text-lg font-bold text-grafito">
                        {regla.horaDesde} – {regla.horaHasta}
                      </p>
                      {regla.motivo && <p className="text-xs text-grafito/70">{regla.motivo}</p>}
                      {/* Excepción de horario de atención sintética
                          (nueva función, corrección de QA 2026-09-08):
                          "Ver..." sigue funcionando (resuelve la fila real
                          en Configuración de calendario), solo cambia la
                          etiqueta; "Eliminar" se oculta — no hay un
                          bloqueo real detrás de este id. */}
                      <button
                        type="button"
                        onClick={() => onVerRegla(regla.id)}
                        className="mt-2 rounded-full border-[0.5px] border-arena bg-marfil px-3 py-1 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                      >
                        {esExcepcionSintetica(regla) ? "Ver excepción de horario" : "Ver este horario reservado"}
                      </button>
                      {!esExcepcionSintetica(regla) && (
                        <BotonEliminar
                          regla={regla}
                          confirmandoEliminarId={confirmandoEliminarId}
                          pendingId={pendingId}
                          onPedirConfirmar={setConfirmandoEliminarId}
                          onCancelar={() => setConfirmandoEliminarId(null)}
                          onConfirmar={eliminarRegla}
                        />
                      )}
                    </div>
                  ),
                }))}
              />

              {/* Turnos en conflicto (paso 2, 2026-09-04) — solo los que
                  TODAVÍA no pasaron; sección APARTE, con su propio título
                  y su propio scroll (mismo criterio que la lista de
                  reglas de arriba): "un horario reservado que se solapa
                  con el turno o más... mostrará la tarjeta... con la
                  pista en el cuerpo x turnos en conflicto". Cada tarjeta
                  replica el formato de TurnoDetalle (hora grande,
                  paciente, tipo de consulta). El aviso fijo pedido por el
                  cliente ("turno en conflicto con un horario reservado,
                  hablar con el paciente para acordar otro horario") va UNA
                  sola vez debajo del título, no repetido en cada tarjeta
                  — corrección de QA, 2026-09-08: "así no se hace tan
                  grande la ventana". */}
              {turnosEnConflicto.length > 0 && (
                <>
                  <p className="text-sm font-medium text-grafito">Turnos en conflicto</p>
                  <p className="rounded-field border-[0.5px] border-terracota bg-terracota-claro px-2 py-1.5 text-xs text-terracota-oscuro">
                    Turno en conflicto con un horario reservado. Hablar con el paciente para acordar otro horario.
                  </p>
                  {/* Autoreservar turnos (nueva función, pedido textual
                      del cliente, 2026-09-08): mueve cada turno afectado
                      al próximo horario libre, por orden de prioridad
                      (quien tenía el turno antes, primero) — calculado
                      del lado del backend (autoreservarTurnosHandler),
                      no necesariamente el mismo día. Reemplaza el cuerpo
                      del modal por la pantalla "horario viejo → horario
                      nuevo" al terminar. */}
                  {errorAutoreservar && (
                    <p role="alert" className="text-sm text-terracota-oscuro">
                      {errorAutoreservar}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={autoreservarTurnos}
                    disabled={autoreservando}
                    className="self-start rounded-full bg-salvia-oscuro px-4 py-2 text-sm font-medium text-marfil hover:brightness-95 disabled:opacity-60"
                  >
                    {autoreservando ? "Autoreservando…" : "Autoreservar turnos"}
                  </button>
                  <ScrollDeUnaTarjeta
                    items={turnosEnConflicto.map((turno) => ({
                      id: turno.id,
                      contenido: (
                        <TarjetaTurno turno={turno} tipo={turno.tipoConsultaId ? tipoPorId.get(turno.tipoConsultaId) : undefined} onVerTurno={onVerTurno} />
                      ),
                    }))}
                  />
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
                  <ScrollDeUnaTarjeta
                    items={turnosResueltos.map((turno) => ({
                      id: turno.id,
                      contenido: (
                        <TarjetaTurno turno={turno} tipo={turno.tipoConsultaId ? tipoPorId.get(turno.tipoConsultaId) : undefined} onVerTurno={onVerTurno} />
                      ),
                    }))}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}

// ScrollDeUnaTarjeta — corrección de QA, 2026-09-08: la versión anterior
// (`max-h-72` a ojo, unas 2 tarjetas y media) cortaba la siguiente
// tarjeta a la mitad — un corte feo, y en pantallas chicas (mobile)
// apenas dejaba ver la primera completa. Propuesta del cliente, "más
// elegante": mide el alto REAL de la primera tarjeta (varía según el
// contenido — un motivo largo la hace más alta) con ResizeObserver y lo
// usa como el `max-h` del contenedor — siempre se ve exactamente UNA
// tarjeta completa, nunca una cortada a la mitad; con más de una,
// aparece la scrollbar (`panel-card-scroll`, la misma fina/discreta que
// ya usan las tarjetas del dashboard) para ver el resto.
// GAP_TARJETAS_PX — mismo valor que la clase `gap-2` de abajo (0.5rem),
// para poder calcular cuánto ocupan `mostrar` tarjetas Y los huecos entre
// ellas, no solo las tarjetas solas.
const GAP_TARJETAS_PX = 8;

function ScrollDeUnaTarjeta({
  items,
  mostrar = 1,
}: {
  items: { id: string; contenido: ReactNode }[];
  // mostrar — cuántas tarjetas completas dejar a la vista antes de que
  // aparezca la scrollbar (corrección de QA, 2026-09-08, pantalla de
  // confirmación de "Autoreservar turnos": "si son más de 1 turno
  // mostrar 3 y medio... y más de esos bajar con scrollbar") — default 1
  // (el criterio ya validado para horarios reservados/turnos en
  // conflicto/resueltos: siempre exactamente una tarjeta completa a la
  // vista). Puede ser fraccionario (3.5) a propósito: deja asomar la
  // mitad de la próxima tarjeta como pista visual de que hay más para
  // scrollear, sin necesitar tocar nada para notarlo.
  mostrar?: number;
}) {
  const [altura, setAltura] = useState<number>();
  const primerItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = primerItemRef.current;
    if (!el) return;
    const medir = () => setAltura(el.offsetHeight);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
    // items[0]?.id (no `items` entero): remedir solo si CAMBIA cuál es la
    // primera tarjeta (ej. se eliminó la que estaba arriba) — no hace
    // falta recrear el observer en cada render por el resto de la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items[0]?.id]);

  const maxHeight = altura ? altura * mostrar + GAP_TARJETAS_PX * Math.max(mostrar - 1, 0) : undefined;

  return (
    <div className="panel-card-scroll flex flex-col gap-2 overflow-y-auto pr-1" style={maxHeight ? { maxHeight: `${maxHeight}px` } : undefined}>
      {items.map((item, i) => (
        <div key={item.id} ref={i === 0 ? primerItemRef : undefined}>
          {item.contenido}
        </div>
      ))}
    </div>
  );
}

// PantallaConfirmacionAutoreserva — reemplaza el cuerpo del modal después
// de "Autoreservar turnos" (nueva función, pedido textual del cliente,
// 2026-09-08): "mostrará una pantalla que dice el turno x horario viejo
// -> turno x horario nuevo y un botón de informar afectados, que por el
// momento no hará nada". Reutiliza ScrollDeUnaTarjeta con `mostrar={3.5}`
// (corrección de QA, mismo día: "si son más de 1 turno mostrar 3 y
// medio... y más de esos bajar con scrollbar") — a diferencia de las
// listas de horarios reservados/turnos en conflicto (una tarjeta a la
// vez), esta pantalla ya ES la confirmación final, así que conviene
// dejar ver de entrada varios resultados de un vistazo; la mitad de la
// 4ª tarjeta asomando es la pista de que hay más para scrollear. Un
// turno sin hueco libre dentro de la ventana de búsqueda del backend
// (`reprogramado: false`) se muestra aparte, sin flecha de horario nuevo
// — nunca se tocó, sigue como estaba.
function PantallaConfirmacionAutoreserva({ resultados }: { resultados: AutoreservarResultadoItem[] }) {
  const noReprogramados = resultados.filter((r) => !r.reprogramado);
  return (
    <>
      <p className="text-sm text-grafito/60">
        {resultados.length === 1 ? "1 turno reprogramado:" : `${resultados.length} turnos reprogramados:`}
      </p>
      <ScrollDeUnaTarjeta
        mostrar={3.5}
        items={resultados.map((r) => ({
          id: r.turnoId,
          contenido: (
            <div className="rounded-field border-[0.5px] border-arena bg-hueso p-3">
              <p className="text-sm font-bold text-grafito">{r.nombre}</p>
              {r.reprogramado ? (
                <p className="mt-1 font-[family-name:var(--font-mono)] text-sm text-grafito">
                  {formatFechaHora(r.horaInicioAnterior)} <span className="text-grafito/40">→</span>{" "}
                  <span className="font-bold text-salvia-oscuro">{formatFechaHora(r.horaInicioNueva ?? undefined)}</span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-terracota-oscuro">No se encontró un horario libre — sigue como estaba.</p>
              )}
            </div>
          ),
        }))}
      />
      {noReprogramados.length > 0 && (
        <p className="text-xs text-terracota-oscuro">
          {noReprogramados.length === 1
            ? "1 turno no se pudo reprogramar."
            : `${noReprogramados.length} turnos no se pudieron reprogramar.`}
        </p>
      )}
      <button
        type="button"
        // Informar afectados: por ahora no hace nada (pedido textual del
        // cliente, "que por el momento no hará nada") — queda como stub
        // a propósito para la futura integración de notificación real.
        onClick={() => {}}
        className="self-start rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
      >
        Informar afectados
      </button>
    </>
  );
}

function TarjetaTurno({
  turno,
  tipo,
  onVerTurno,
}: {
  turno: Turno;
  tipo?: TipoConsulta;
  onVerTurno?: (turno: Turno) => void;
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
