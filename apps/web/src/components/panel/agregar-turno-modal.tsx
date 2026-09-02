"use client";

import { useEffect, useState } from "react";
import type { Paciente, TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { agendarTurnoAction, crearTurnoManualAction, listTurnosAction } from "@/app/actions/turnos";
import { listPacientesAction } from "@/app/actions/pacientes";
import { listDisponibilidadAction } from "@/app/actions/calendario-config";
import { fechaISOLocal } from "@/lib/calendar-utils";
import { HoraPicker } from "./hora-picker";
import { ModalPortal } from "./modal-portal";

interface AgregarTurnoModalProps {
  tiposConsulta: TipoConsulta[];
  onClose: () => void;
  onSuccess: (turno: Turno) => void;
  // T3.4: al abrir el modal desde un turno pendiente puntual de la vista
  // Turnos ("Confirmar"), se salta el paso "paciente" y arranca directo en
  // "detalle" con ese paciente ya elegido — mismo componente que T2.4, sin
  // duplicar lógica.
  turnoPendienteInicial?: Turno;
}

type Paso = "paciente" | "detalle";
type Origen = "pendiente" | "conocido" | "nuevo";

// NUEVO_PACIENTE_INICIAL — Extra 2.3.5 (E5.4, fix de bug): estado vacío del
// formulario "paciente nuevo", factorizado para poder resetearlo al volver
// de "paciente conocido" (ver abrirPestañaNuevo más abajo).
const NUEVO_PACIENTE_INICIAL = {
  nombreContacto: "",
  apellidoContacto: "",
  dniContacto: "",
  telefonoContacto: "",
  emailContacto: "",
  motivo: "",
};

// Un renglón por origen: qué es y de dónde sale (pedido explícito del
// cliente, 2026-08-23 — "dar información a qué hace referencia cada
// sección y de dónde estoy cargando los pacientes").
const DESCRIPCION_ORIGEN: Record<Origen, string> = {
  pendiente: "Pedidos de turno que llegaron desde tu página pública y todavía no tienen horario confirmado.",
  conocido: "Elegí de tu lista de Pacientes ya cargados — no hace falta volver a tipear sus datos.",
  nuevo: "Para alguien que nunca tuvo un turno con vos: se crea su ficha de paciente en este mismo paso.",
};

// Modal "+ Agregar turno" (spec §4.3, renombrado de "+ Nueva sesión") —
// tres caminos de paciente (desde pendientes / conocido / nuevo, estos dos
// últimos sumados 2026-08-23), tipo de consulta + hora + motivo, confirmar.
// Fondo con blur (backdrop-blur) como pide la spec.
export function AgregarTurnoModal({ tiposConsulta, onClose, onSuccess, turnoPendienteInicial }: AgregarTurnoModalProps) {
  const [paso, setPaso] = useState<Paso>(turnoPendienteInicial ? "detalle" : "paciente");
  const [origen, setOrigen] = useState<Origen>("pendiente");

  const [pendientes, setPendientes] = useState<Turno[]>([]);
  const [cargandoPendientes, setCargandoPendientes] = useState(true);
  const [turnoPendiente, setTurnoPendiente] = useState<Turno | null>(turnoPendienteInicial ?? null);

  const [pacientesConocidos, setPacientesConocidos] = useState<Paciente[] | null>(null);
  const [cargandoPacientes, setCargandoPacientes] = useState(false);
  const [buscarPaciente, setBuscarPaciente] = useState("");
  const [pacienteElegidoId, setPacienteElegidoId] = useState<string | null>(null);

  const [nuevoPaciente, setNuevoPaciente] = useState(NUEVO_PACIENTE_INICIAL);
  // duplicadoDni/verificandoDni — corrección de bug (ver continuarConNuevo
  // más abajo): paciente encontrado por DNI exacto al intentar avanzar
  // desde "Paciente nuevo", para poder ofrecer "Usar este paciente" sin
  // que el profesional tenga que ir a buscarlo a mano en "conocido".
  const [duplicadoDni, setDuplicadoDni] = useState<Paciente | null>(null);
  const [verificandoDni, setVerificandoDni] = useState(false);

  const tipoGeneral = tiposConsulta.find((t) => t.nombre === "Consulta general") ?? tiposConsulta[0];
  const [tipoConsultaId, setTipoConsultaId] = useState(tipoGeneral?.id ?? "");
  // No se puede agendar un turno en el pasado (2026-08-23) — `min` es solo
  // una ayuda nativa del date picker, la validación real pasa en confirmar().
  // `fechaISOLocal` (TR-074 en docs/tradeoffs.md, 2026-08-27, reemplaza
  // `new Date().toISOString().slice(0, 10)`): esa versión daba la fecha
  // en UTC, que en Argentina (UTC-3) se adelanta al día siguiente entre
  // las ~21:00 y medianoche local — el campo de fecha arrancaba en
  // "mañana" sin que se notara, y una hora ya pasada HOY quedaba "en el
  // futuro" respecto a esa fecha adelantada por error (el bug real
  // detrás de "me deja ingresar horas pasadas").
  const hoyISO = fechaISOLocal();
  const [fecha, setFecha] = useState(() => hoyISO);
  // Hora — corrección de QA (F2.3): ya no es un <input type="time"> libre
  // (dejaba elegir 01:00, 22:00, horarios fuera del calendario, horarios
  // ya ocupados por otro turno...) sino un <select> con los horarios que
  // el backend YA calculó como realmente disponibles (GET /disponibilidad
  // — horario de atención, bloqueos y turnos ya agendados con su propio
  // tiempo post-consulta, todo descontado de una — ver disponibilidad.go)
  // para el tipo de consulta y la fecha elegidos. "Duración" también deja
  // de ser un selector manual: sale de `tipoConsulta.duracionMinutos`, es
  // intrínseca al tipo de consulta, no algo que se elija turno a turno.
  const [hora, setHora] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  // Arranca en "cargando" solo si ya hay un tipo de consulta elegido (el
  // caso normal — tipoGeneral siempre existe si hay algún tipo cargado):
  // evita quedarse mostrando "Buscando horarios…" para siempre si no hay
  // ningún tipo de consulta configurado, ver el useEffect de abajo.
  const [cargandoSlots, setCargandoSlots] = useState(() => Boolean(tipoConsultaId));
  // Motivo de consulta (2026-08-23): un solo campo en el paso "detalle",
  // compartido por los tres caminos — se precarga con lo que ya se sabía
  // (el motivo del turno pendiente, o lo tipeado en "Paciente nuevo") y
  // queda editable ahí mismo antes de confirmar.
  const [motivoDetalle, setMotivoDetalle] = useState(() => turnoPendienteInicial?.motivo ?? "");

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let activo = true;
    listTurnosAction({ estado: "pendiente" }).then((turnos) => {
      if (activo) {
        setPendientes(turnos);
        setCargandoPendientes(false);
      }
    });
    return () => {
      activo = false;
    };
  }, []);

  // Disponibilidad real (F2.3, corrección de QA) — se vuelve a pedir cada
  // vez que cambia el tipo de consulta (cambia la duración/tiempo
  // post-consulta que hay que hacer entrar) o la fecha. Si el horario ya
  // elegido deja de estar en la lista nueva (cambió el tipo o la fecha),
  // se limpia — nunca se manda un horario que el backend ya no ofrece.
  // Sin excluirTurnoId: un turno "pendiente" (el único que este modal
  // puede tocar además de crear uno nuevo) todavía no tiene horario
  // fijo, así que nunca aparece ocupando un slot en primer lugar —
  // reprogramar un turno YA agendado es cosa de editar-turno-modal.tsx.
  useEffect(() => {
    // setCargandoSlots(true) se dispara desde quien CAMBIA tipoConsultaId/
    // fecha (los onChange de abajo), no acá adentro — llamar setState de
    // forma síncrona al entrar a un efecto dispara renders en cascada
    // (react-hooks/set-state-in-effect, mismo criterio que calendar-view.tsx);
    // este efecto solo sincroniza con el servidor y apaga el loading
    // cuando la respuesta llega.
    if (!tipoConsultaId) return;
    let activo = true;
    listDisponibilidadAction(tipoConsultaId, fecha).then((disponibilidad) => {
      if (!activo) return;
      setSlots(disponibilidad.slots);
      setCargandoSlots(false);
      setHora((actual) => (disponibilidad.slots.includes(actual) ? actual : (disponibilidad.slots[0] ?? "")));
    });
    return () => {
      activo = false;
    };
  }, [tipoConsultaId, fecha]);

  // Carga los pacientes ya cargados recién cuando el profesional entra a
  // esa pestaña — evita el pedido si nunca la abre.
  function abrirPestañaConocido() {
    setOrigen("conocido");
    if (pacientesConocidos === null && !cargandoPacientes) {
      setCargandoPacientes(true);
      listPacientesAction().then((pacientes) => {
        setPacientesConocidos(pacientes);
        setCargandoPacientes(false);
      });
    }
  }

  // abrirPestañaNuevo — Extra 2.3.5 (E5.4, fix de bug): "volver de 'paciente
  // conocido' a 'turno con paciente nuevo' no debe dejar precargados los
  // datos del paciente conocido". elegirConocido (más abajo) precarga
  // `nuevoPaciente` con los datos de quien se eligió — si el profesional
  // vuelve con "Atrás" y después toca esta pestaña, esos datos quedaban
  // pisando el formulario de "paciente nuevo" en vez de arrancar en blanco.
  // Solo se limpia cuando hay un `pacienteElegidoId` real (viene de
  // "conocido"): si ya estaba en "nuevo" tipeando, no se pisa lo que
  // escribió.
  function abrirPestañaNuevo() {
    if (pacienteElegidoId !== null) {
      setNuevoPaciente(NUEVO_PACIENTE_INICIAL);
      setPacienteElegidoId(null);
    }
    setDuplicadoDni(null);
    setError(null);
    setOrigen("nuevo");
  }

  function buscarPacientesConocidos(e: React.FormEvent) {
    e.preventDefault();
    setCargandoPacientes(true);
    listPacientesAction(buscarPaciente || undefined).then((pacientes) => {
      setPacientesConocidos(pacientes);
      setCargandoPacientes(false);
    });
  }

  function elegirPendiente(t: Turno) {
    setTurnoPendiente(t);
    setPacienteElegidoId(null);
    setMotivoDetalle(t.motivo);
    setPaso("detalle");
  }

  function elegirConocido(p: Paciente) {
    setTurnoPendiente(null);
    setPacienteElegidoId(p.id);
    setDuplicadoDni(null);
    setError(null);
    setNuevoPaciente({
      nombreContacto: p.nombre,
      apellidoContacto: p.apellido,
      dniContacto: p.dni,
      telefonoContacto: p.telefono,
      emailContacto: p.email ?? "",
      motivo: "",
    });
    setMotivoDetalle("");
    setPaso("detalle");
  }

  // continuarConNuevo — Extra 2.3.5, corrección de bug reportado por el
  // cliente: "desde el calendario me deja crear paciente nuevo con un DNI
  // que ya existe... se genera un turno con un paciente que no está en el
  // apartado pacientes, no hay verificación en este lugar". El backend
  // (crearOBuscarPacientePorDNI, E5.1) SÍ reusa la ficha existente en vez
  // de duplicarla — pero en silencio: el turno terminaba mostrando el
  // nombre recién tipeado mientras el Paciente vinculado de verdad
  // (encontrado por DNI) podía tener otro nombre distinto, sin ningún
  // aviso de que eso pasó. Se verifica ACÁ, antes de avanzar de paso, con
  // el mismo buscador de "Paciente conocido" (listPacientesAction) — el
  // backend hace ILIKE parcial, así que se filtra por coincidencia EXACTA
  // de DNI. Si ya existe, no se avanza: se ofrece ir directo a "Paciente
  // conocido" con esa ficha (mismo camino que elegirConocido) en vez de
  // seguir con datos que terminarían ignorados.
  async function continuarConNuevo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDuplicadoDni(null);
    const dni = nuevoPaciente.dniContacto.trim();
    if (!nuevoPaciente.nombreContacto.trim() || !nuevoPaciente.apellidoContacto.trim() || !dni || !nuevoPaciente.telefonoContacto.trim()) {
      setError("Nombre, apellido, DNI y teléfono son obligatorios.");
      return;
    }

    setVerificandoDni(true);
    const encontrados = await listPacientesAction(dni);
    setVerificandoDni(false);
    const existente = encontrados.find((p) => p.dni === dni);
    if (existente) {
      setDuplicadoDni(existente);
      setError(`No se pudo generar el turno: el paciente con DNI ${dni} ya existe y es ${existente.nombre} ${existente.apellido}.`);
      return;
    }

    setTurnoPendiente(null);
    setPacienteElegidoId(null);
    setMotivoDetalle(nuevoPaciente.motivo);
    setPaso("detalle");
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tipoConsultaId) {
      setError("Elegí un tipo de consulta.");
      return;
    }
    if (!hora) {
      setError("Elegí un horario disponible.");
      return;
    }
    // Duración intrínseca del tipo de consulta (corrección de QA, F2.3:
    // "eso es intrínseco del tipo de consulta") — ya no un selector
    // manual. El tiempo post-consulta NO se suma acá: es un margen de
    // limpieza/orden que ocupa la agenda (así lo descuenta /disponibilidad)
    // pero no forma parte del turno en sí — se pinta aparte en el
    // calendario (ver calendar-grid.tsx).
    const duracion = tiposConsulta.find((t) => t.id === tipoConsultaId)?.duracionMinutos ?? 30;
    const horaInicio = new Date(`${fecha}T${hora}:00`);
    const horaFin = new Date(horaInicio.getTime() + duracion * 60_000);

    // No se puede agendar un turno en el pasado — red de seguridad
    // (pedido explícito del cliente, 2026-08-23): en la práctica ya no
    // debería poder pasar, /disponibilidad no ofrece horarios pasados de
    // hoy, pero el horario elegido pudo quedar viejo si el profesional
    // dejó el modal abierto mucho rato.
    if (horaInicio < new Date()) {
      setError("No se puede agendar un turno en una fecha pasada.");
      return;
    }

    setPending(true);
    const result =
      turnoPendiente !== null
        ? await agendarTurnoAction(turnoPendiente.id, {
            tipoConsultaId,
            horaInicio: horaInicio.toISOString(),
            horaFin: horaFin.toISOString(),
            motivo: motivoDetalle,
          })
        : await crearTurnoManualAction({
            ...nuevoPaciente,
            motivo: motivoDetalle,
            tipoConsultaId,
            horaInicio: horaInicio.toISOString(),
            horaFin: horaFin.toISOString(),
            pacienteId: pacienteElegidoId ?? undefined,
          });

    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSuccess(result.turno);
  }

  const nombrePacientePendiente = turnoPendiente
    ? `${turnoPendiente.nombreContacto} ${turnoPendiente.apellidoContacto}`
    : `${nuevoPaciente.nombreContacto} ${nuevoPaciente.apellidoContacto}`.trim();

  return (
    <ModalPortal>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agregar turno"
      className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg max-md:max-w-[90vw] flex-col overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
        <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Agregar turno</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
            ×
          </button>
        </div>

        {paso === "paciente" && (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex gap-1 rounded-full border-[0.5px] border-arena p-1">
              <button
                type="button"
                onClick={() => setOrigen("pendiente")}
                className={`flex-1 rounded-full py-2 text-sm font-medium ${origen === "pendiente" ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
              >
                Desde pendientes
              </button>
              <button
                type="button"
                onClick={abrirPestañaConocido}
                className={`flex-1 rounded-full py-2 text-sm font-medium ${origen === "conocido" ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
              >
                Paciente conocido
              </button>
              <button
                type="button"
                onClick={abrirPestañaNuevo}
                className={`flex-1 rounded-full py-2 text-sm font-medium ${origen === "nuevo" ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
              >
                Paciente nuevo
              </button>
            </div>
            <p className="text-xs text-grafito/60">{DESCRIPCION_ORIGEN[origen]}</p>

            {origen === "pendiente" && (
              // max-h + overflow-y-auto (corrección de QA): "a medida que
              // se van acumulando... turnos pendientes se agranda la
              // pestaña, organizar esto con un scrollbar" — antes la
              // lista crecía sin límite y estiraba todo el modal.
              <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                {cargandoPendientes && <p className="text-sm text-grafito/60">Cargando…</p>}
                {!cargandoPendientes && pendientes.length === 0 && (
                  <p className="text-sm text-grafito/60">No hay turnos pendientes por ahora.</p>
                )}
                {pendientes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => elegirPendiente(t)}
                    className="flex flex-shrink-0 flex-col gap-0.5 rounded-field border-[0.5px] border-arena bg-hueso px-4 py-3 text-left hover:border-salvia"
                  >
                    <span className="text-sm font-semibold text-grafito">
                      {t.nombreContacto} {t.apellidoContacto}
                    </span>
                    {t.motivo && <span className="text-xs text-grafito/60">{t.motivo}</span>}
                  </button>
                ))}
              </div>
            )}

            {origen === "conocido" && (
              <div className="flex flex-col gap-3">
                <form onSubmit={buscarPacientesConocidos} className="flex gap-2">
                  <input
                    type="search"
                    value={buscarPaciente}
                    onChange={(e) => setBuscarPaciente(e.target.value)}
                    placeholder="Nombre, apellido o DNI…"
                    aria-label="Buscar paciente"
                    className={`flex-1 ${inputClass}`}
                  />
                  <button type="submit" className="rounded-full border-[0.5px] border-arena px-4 py-2 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro">
                    Buscar
                  </button>
                </form>
                {/* max-h + overflow-y-auto (corrección de QA): "a medida
                    que se van acumulando pacientes conocidos... se
                    agranda la pestaña, organizar esto con un scrollbar"
                    — el buscador de arriba queda fijo, solo scrollean
                    los resultados. */}
                <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                  {cargandoPacientes && <p className="text-sm text-grafito/60">Cargando…</p>}
                  {!cargandoPacientes && pacientesConocidos?.length === 0 && (
                    <p className="text-sm text-grafito/60">No encontramos pacientes para esa búsqueda.</p>
                  )}
                  {!cargandoPacientes &&
                    pacientesConocidos?.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => elegirConocido(p)}
                        className="flex flex-shrink-0 flex-col gap-0.5 rounded-field border-[0.5px] border-arena bg-hueso px-4 py-3 text-left hover:border-salvia"
                      >
                        <span className="text-sm font-semibold text-grafito">
                          {p.nombre} {p.apellido}
                        </span>
                        <span className="font-[family-name:var(--font-mono)] text-xs text-grafito/60">DNI {p.dni}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {origen === "nuevo" && (
              <form onSubmit={continuarConNuevo} className="flex flex-col gap-4">
                <Campo label="Nombre">
                  <input
                    value={nuevoPaciente.nombreContacto}
                    onChange={(e) => setNuevoPaciente((p) => ({ ...p, nombreContacto: e.target.value }))}
                    className={inputClass}
                  />
                </Campo>
                <Campo label="Apellido">
                  <input
                    value={nuevoPaciente.apellidoContacto}
                    onChange={(e) => setNuevoPaciente((p) => ({ ...p, apellidoContacto: e.target.value }))}
                    className={inputClass}
                  />
                </Campo>
                <Campo label="DNI">
                  <input
                    value={nuevoPaciente.dniContacto}
                    onChange={(e) => setNuevoPaciente((p) => ({ ...p, dniContacto: e.target.value }))}
                    className={inputClass}
                  />
                </Campo>
                <Campo label="Teléfono">
                  <input
                    value={nuevoPaciente.telefonoContacto}
                    onChange={(e) => setNuevoPaciente((p) => ({ ...p, telefonoContacto: e.target.value }))}
                    className={inputClass}
                  />
                </Campo>
                <Campo label="Email (opcional)">
                  <input
                    type="email"
                    value={nuevoPaciente.emailContacto}
                    onChange={(e) => setNuevoPaciente((p) => ({ ...p, emailContacto: e.target.value }))}
                    className={inputClass}
                  />
                </Campo>
                <Campo label="Motivo de consulta (opcional)">
                  <input
                    value={nuevoPaciente.motivo}
                    onChange={(e) => setNuevoPaciente((p) => ({ ...p, motivo: e.target.value }))}
                    className={inputClass}
                  />
                </Campo>

                {error && <ErrorMsg>{error}</ErrorMsg>}

                <div className="flex items-center justify-end gap-3">
                  {duplicadoDni && (
                    <button
                      type="button"
                      onClick={() => elegirConocido(duplicadoDni)}
                      className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
                    >
                      Usar este paciente
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={verificandoDni}
                    className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
                  >
                    {verificandoDni ? "Verificando…" : "Continuar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {paso === "detalle" && (
          // noValidate: el input de fecha tiene `min` como ayuda nativa del
          // date picker, pero la validación real (con el mensaje en
          // español, mismo estilo que el resto de la app) la maneja
          // confirmar() — sin esto, el navegador bloquea el submit en
          // silencio cuando el valor queda por debajo de `min`, y el
          // mensaje propio nunca llega a mostrarse.
          <form onSubmit={confirmar} noValidate className="flex flex-col gap-5 p-6">
            <div className="rounded-field border-[0.5px] border-arena bg-hueso p-3 text-sm">
              <span className="text-grafito/60">Paciente: </span>
              <span className="font-semibold text-grafito">{nombrePacientePendiente}</span>
            </div>

            <Campo label="Tipo de consulta">
              <select
                value={tipoConsultaId}
                onChange={(e) => {
                  setTipoConsultaId(e.target.value);
                  setCargandoSlots(true);
                }}
                className={inputClass}
              >
                {tiposConsulta.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>

            <div className="grid grid-cols-2 gap-4">
              <Campo label="Fecha">
                <input
                  type="date"
                  value={fecha}
                  min={hoyISO}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    setCargandoSlots(true);
                  }}
                  className={inputClass}
                />
              </Campo>
              {/* Sin <Campo> acá a propósito: ese helper envuelve todo en
                  un <label>, y un <label> le pega su propio texto como
                  nombre accesible a CUALQUIER elemento etiquetable que
                  contenga (button incluido) — cada opción del HoraPicker
                  terminaba anunciándose como "Hora" en vez de "09:00",
                  "09:15"... (encontrado depurando el error de hidratación
                  de /panel/calendario, 2026-08-30: un test con
                  getByRole("option", {name:"10:00"}) no encontraba nada,
                  ver hora-picker.test.tsx). El <span> de acá abajo es
                  puramente visual; HoraPicker ya trae su propio
                  aria-label="Hora" en el contenedor. */}
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-grafito">Hora</span>
                <HoraPicker slots={slots} value={hora} onChange={setHora} cargando={cargandoSlots} />
              </div>
            </div>

            <Campo label="Motivo de consulta (opcional)">
              <input value={motivoDetalle} onChange={(e) => setMotivoDetalle(e.target.value)} className={inputClass} />
            </Campo>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setPaso("paciente")}
                className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
              >
                Atrás
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
              >
                {pending ? "Confirmando…" : "Confirmar"}
              </button>
            </div>
          </form>
        )}
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

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-terracota-oscuro">
      {children}
    </p>
  );
}
