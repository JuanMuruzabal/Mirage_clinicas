"use client";

import { useEffect, useState } from "react";
import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";
import { editarTurnoAction, reprogramarTurnoAction } from "@/app/actions/turnos";
import { listDisponibilidadAction } from "@/app/actions/calendario-config";
import { fechaISOLocal } from "@/lib/calendar-utils";
import { HoraPicker } from "./hora-picker";
import { ModalPortal } from "./modal-portal";

interface EditarTurnoModalProps {
  turno: Turno;
  tiposConsulta: TipoConsulta[];
  onClose: () => void;
  onSuccess: (turno: Turno) => void;
}

// EditarTurnoModal (T3.3) — ajuste pedido por el cliente (2026-08-23): lo
// que se puede editar depende del estado del turno.
//   · pendiente → todos los datos de contacto (comportamiento original).
//   · agendado  → solo el horario (nombre/DNI/etc. ya se usaron para crear
//     el paciente); el cambio de horario pasa por el mismo exclusion
//     constraint que agendar por primera vez (T2.5).
// Nunca el tipo de consulta acá — eso sigue siendo del modal "+ Agregar
// turno" (T2.4/T3.4). `tiposConsulta` (F2.3, corrección de QA) hace falta
// igual: para saber la duración intrínseca del tipo YA elegido cuando se
// reprograma el horario.
export function EditarTurnoModal({ turno, tiposConsulta, onClose, onSuccess }: EditarTurnoModalProps) {
  if (turno.estado === "agendado") {
    return <EditarHoraForm turno={turno} tiposConsulta={tiposConsulta} onClose={onClose} onSuccess={onSuccess} />;
  }
  return <EditarContactoForm turno={turno} tiposConsulta={tiposConsulta} onClose={onClose} onSuccess={onSuccess} />;
}

function ModalShell({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
        <div className="flex max-h-[90vh] w-full max-w-lg max-md:max-w-[90vw] flex-col overflow-y-auto rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <div className="flex items-center justify-between border-b-[0.5px] border-arena px-6 py-4">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">{titulo}</h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="text-2xl leading-none text-grafito/50 hover:text-grafito">
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </ModalPortal>
  );
}

function EditarContactoForm({ turno, onClose, onSuccess }: EditarTurnoModalProps) {
  const [campos, setCampos] = useState({
    nombreContacto: turno.nombreContacto,
    apellidoContacto: turno.apellidoContacto,
    dniContacto: turno.dniContacto,
    telefonoContacto: turno.telefonoContacto,
    emailContacto: turno.emailContacto,
    motivo: turno.motivo,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function actualizar<K extends keyof typeof campos>(campo: K, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (
      !campos.nombreContacto.trim() ||
      !campos.apellidoContacto.trim() ||
      !campos.dniContacto.trim() ||
      !campos.telefonoContacto.trim()
    ) {
      setError("Nombre, apellido, DNI y teléfono son obligatorios.");
      return;
    }

    setPending(true);
    const result = await editarTurnoAction(turno.id, {
      ...campos,
      emailContacto: campos.emailContacto || undefined,
      motivo: campos.motivo || undefined,
    });
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSuccess(result.turno);
  }

  return (
    <ModalShell titulo="Editar turno" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col gap-4 p-6">
        <p className="text-sm text-grafito/60">
          Este turno todavía está pendiente — se puede corregir cualquier dato de contacto. Una vez confirmado, solo se
          va a poder cambiar el horario.
        </p>
        <Campo label="Nombre">
          <input value={campos.nombreContacto} onChange={(e) => actualizar("nombreContacto", e.target.value)} className={inputClass} />
        </Campo>
        <Campo label="Apellido">
          <input
            value={campos.apellidoContacto}
            onChange={(e) => actualizar("apellidoContacto", e.target.value)}
            className={inputClass}
          />
        </Campo>
        <Campo label="DNI">
          <input value={campos.dniContacto} onChange={(e) => actualizar("dniContacto", e.target.value)} className={inputClass} />
        </Campo>
        <Campo label="Teléfono">
          <input
            value={campos.telefonoContacto}
            onChange={(e) => actualizar("telefonoContacto", e.target.value)}
            className={inputClass}
          />
        </Campo>
        <Campo label="Email (opcional)">
          <input
            type="email"
            value={campos.emailContacto}
            onChange={(e) => actualizar("emailContacto", e.target.value)}
            className={inputClass}
          />
        </Campo>
        <Campo label="Motivo de consulta (opcional)">
          <input value={campos.motivo} onChange={(e) => actualizar("motivo", e.target.value)} className={inputClass} />
        </Campo>

        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function EditarHoraForm({ turno, tiposConsulta, onClose, onSuccess }: EditarTurnoModalProps) {
  const inicioActual = turno.horaInicio ? new Date(turno.horaInicio) : new Date();
  const finActual = turno.horaFin ? new Date(turno.horaFin) : new Date(inicioActual.getTime() + 30 * 60_000);
  // Duración intrínseca del tipo de consulta YA elegido (corrección de
  // QA, F2.3) — el tipo de consulta no se puede cambiar acá (nunca se
  // pudo, ver el comment grande de arriba), así que su duración tampoco
  // es algo que se elija de nuevo; se usa para calcular horaFin al
  // reprogramar. Si por algún motivo no se encuentra el tipo (borrado
  // después de agendar el turno), cae a la duración que ya tenía el
  // turno como último recurso.
  const duracionActual = Math.max(Math.round((finActual.getTime() - inicioActual.getTime()) / 60_000), 15);
  const duracion = tiposConsulta.find((t) => t.id === turno.tipoConsultaId)?.duracionMinutos ?? duracionActual;

  // fechaISOLocal (TR-074 en docs/tradeoffs.md, 2026-08-27, reemplaza
  // `inicioActual.toISOString().slice(0, 10)`): esa versión daba la
  // fecha en UTC — un turno a las 22:00 hora local (Argentina, UTC-3)
  // mostraba por error el día SIGUIENTE al abrir este modal. Como `hora`
  // (abajo) sí usa `toTimeString` (local, correcto), el par quedaba
  // desincronizado: si el profesional abría este modal de noche y
  // guardaba sin tocar nada, el turno se corría un día entero sin
  // querer — no era solo un problema visual.
  const [fecha, setFecha] = useState(() => fechaISOLocal(inicioActual));
  const horaActual = inicioActual.toTimeString().slice(0, 5);
  const [hora, setHora] = useState(horaActual);
  const [motivo, setMotivo] = useState(turno.motivo);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Disponibilidad real (F2.3, corrección de QA) — mismo criterio que
  // agregar-turno-modal.tsx, con `excluirTurnoId` para que el propio
  // horario que ya tiene este turno siga apareciendo disponible (si no,
  // "reprogramar" sin cambiar nada mostraría su propio horario como
  // ocupado). Se pide acá adentro, no como prop, porque este modal se
  // monta desde turnos-table.tsx y no comparte un ancestro con
  // CalendarView.
  const [slots, setSlots] = useState<string[]>([horaActual]);
  // Arranca en "cargando" solo si el turno tiene un tipo de consulta
  // asociado (el caso normal) — evita quedarse mostrando "Buscando
  // horarios…" para siempre si por algún motivo no lo tiene.
  const [cargandoSlots, setCargandoSlots] = useState(() => Boolean(turno.tipoConsultaId));
  useEffect(() => {
    // setCargandoSlots(true) se dispara desde quien CAMBIA la fecha (el
    // onChange de abajo — el tipo de consulta no se puede cambiar acá),
    // no acá adentro — mismo criterio que calendar-view.tsx/
    // agregar-turno-modal.tsx (react-hooks/set-state-in-effect): este
    // efecto solo sincroniza con el servidor y apaga el loading cuando
    // la respuesta llega.
    if (!turno.tipoConsultaId) return;
    let activo = true;
    listDisponibilidadAction(turno.tipoConsultaId, fecha, turno.id).then((disponibilidad) => {
      if (!activo) return;
      setSlots(disponibilidad.slots);
      setCargandoSlots(false);
      setHora((actual) => (disponibilidad.slots.includes(actual) ? actual : (disponibilidad.slots[0] ?? "")));
    });
    return () => {
      activo = false;
    };
  }, [turno.tipoConsultaId, turno.id, fecha]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hora) {
      setError("Elegí un horario disponible.");
      return;
    }

    const horaInicio = new Date(`${fecha}T${hora}:00`);
    const horaFin = new Date(horaInicio.getTime() + duracion * 60_000);

    // No se puede mover un turno a una fecha pasada — red de seguridad
    // (pedido explícito del cliente, 2026-08-23), salvo que no haya
    // cambiado el horario (turno ya resuelto, solo se está corrigiendo
    // el motivo). En la práctica ya no debería poder pasar por otra vía:
    // /disponibilidad no ofrece horarios pasados de hoy.
    if (horaInicio.getTime() !== inicioActual.getTime() && horaInicio < new Date()) {
      setError("No se puede reprogramar un turno a una fecha pasada.");
      return;
    }

    setPending(true);
    const result = await reprogramarTurnoAction(turno.id, {
      horaInicio: horaInicio.toISOString(),
      horaFin: horaFin.toISOString(),
      motivo,
    });
    setPending(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSuccess(result.turno);
  }

  return (
    <ModalShell titulo="Editar turno" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col gap-4 p-6">
        <p className="text-sm text-grafito/60">
          Este turno ya está confirmado — solo se puede cambiar el horario y el motivo de consulta. Para corregir un
          dato de contacto, entrá a la ficha del paciente.
        </p>
        <div className="rounded-field border-[0.5px] border-arena bg-hueso p-3 text-sm">
          <span className="text-grafito/60">Paciente: </span>
          <span className="font-semibold text-grafito">
            {turno.nombreContacto} {turno.apellidoContacto}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Fecha">
            <input
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                setCargandoSlots(true);
              }}
              className={inputClass}
            />
          </Campo>
          {/* Sin <Campo> acá a propósito — ver el comentario grande en
              agregar-turno-modal.tsx: un <label> le pega su propio texto
              como nombre accesible a cualquier elemento etiquetable que
              contenga, y cada opción del HoraPicker terminaba
              anunciándose como "Hora" en vez de su propio horario. */}
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-grafito">Hora</span>
            <HoraPicker slots={slots} value={hora} onChange={setHora} cargando={cargandoSlots} />
          </div>
        </div>
        <Campo label="Motivo de consulta (opcional)">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClass} />
        </Campo>

        {error && (
          <p role="alert" className="text-sm text-terracota-oscuro">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border-[0.5px] border-arena px-5 py-2.5 text-sm font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-salvia-oscuro px-5 py-2.5 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </ModalShell>
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
