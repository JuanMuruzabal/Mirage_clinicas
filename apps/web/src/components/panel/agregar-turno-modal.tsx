"use client";

import { useEffect, useState } from "react";
import type { Paciente, TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { agendarTurnoAction, crearTurnoManualAction, listTurnosAction } from "@/app/actions/turnos";
import { listPacientesAction } from "@/app/actions/pacientes";
import { fechaISOLocal, horaISOLocal } from "@/lib/calendar-utils";
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

const DURACIONES = [15, 30, 45, 60];

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

  const [nuevoPaciente, setNuevoPaciente] = useState({
    nombreContacto: "",
    apellidoContacto: "",
    dniContacto: "",
    telefonoContacto: "",
    emailContacto: "",
    motivo: "",
  });

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
  const [hora, setHora] = useState("09:00");
  // Tope mínimo de hora (TR-074): solo tiene sentido cuando la fecha
  // elegida es HOY — un turno para mañana puede ser a cualquier hora. El
  // navegador lo usa como ayuda nativa (igual criterio que `min` en el
  // date picker); la validación real sigue siendo la de confirmar().
  const minHora = fecha === hoyISO ? horaISOLocal() : undefined;
  const [duracion, setDuracion] = useState(30);
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

  function continuarConNuevo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (
      !nuevoPaciente.nombreContacto.trim() ||
      !nuevoPaciente.apellidoContacto.trim() ||
      !nuevoPaciente.dniContacto.trim() ||
      !nuevoPaciente.telefonoContacto.trim()
    ) {
      setError("Nombre, apellido, DNI y teléfono son obligatorios.");
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
    const horaInicio = new Date(`${fecha}T${hora}:00`);
    const horaFin = new Date(horaInicio.getTime() + duracion * 60_000);

    // No se puede agendar un turno en el pasado (pedido explícito del
    // cliente, 2026-08-23) — el backend es la fuente de verdad, esto es
    // solo feedback inmediato antes de mandar la request.
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
                onClick={() => setOrigen("nuevo")}
                className={`flex-1 rounded-full py-2 text-sm font-medium ${origen === "nuevo" ? "bg-salvia-oscuro text-marfil" : "text-grafito hover:bg-arena"}`}
              >
                Paciente nuevo
              </button>
            </div>
            <p className="text-xs text-grafito/60">{DESCRIPCION_ORIGEN[origen]}</p>

            {origen === "pendiente" && (
              <div className="flex flex-col gap-2">
                {cargandoPendientes && <p className="text-sm text-grafito/60">Cargando…</p>}
                {!cargandoPendientes && pendientes.length === 0 && (
                  <p className="text-sm text-grafito/60">No hay turnos pendientes por ahora.</p>
                )}
                {pendientes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => elegirPendiente(t)}
                    className="flex flex-col gap-0.5 rounded-field border-[0.5px] border-arena bg-hueso px-4 py-3 text-left hover:border-salvia"
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
                      className="flex flex-col gap-0.5 rounded-field border-[0.5px] border-arena bg-hueso px-4 py-3 text-left hover:border-salvia"
                    >
                      <span className="text-sm font-semibold text-grafito">
                        {p.nombre} {p.apellido}
                      </span>
                      <span className="font-[family-name:var(--font-mono)] text-xs text-grafito/60">DNI {p.dni}</span>
                    </button>
                  ))}
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

                <button
                  type="submit"
                  className="self-end rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95"
                >
                  Continuar
                </button>
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
              <select value={tipoConsultaId} onChange={(e) => setTipoConsultaId(e.target.value)} className={inputClass}>
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
                  onChange={(e) => setFecha(e.target.value)}
                  className={inputClass}
                />
              </Campo>
              <Campo label="Hora">
                <input type="time" value={hora} min={minHora} onChange={(e) => setHora(e.target.value)} className={inputClass} />
              </Campo>
            </div>

            <Campo label="Duración">
              <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))} className={inputClass}>
                {DURACIONES.map((d) => (
                  <option key={d} value={d}>
                    {d} minutos
                  </option>
                ))}
              </select>
            </Campo>

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
