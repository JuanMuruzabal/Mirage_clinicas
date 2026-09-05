"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { Turno } from "@dental-mirage/shared-types";
import { marcarAsistenciaAction, turnosPendientesAsistenciaAction } from "@/app/actions/turnos";
import { formatDiaLargo, formatHora } from "@/lib/calendar-utils";
import { ModalPortal } from "./modal-portal";

// AsistenciaCartelGlobal — TR-107 (1.3ter en docs/ArquitecturaPeticionesTurno.md),
// pedido textual del cliente: "cuando se completa el turno, es decir
// llego a la hora de finalización del turno, que aparezca un cartel en
// pantalla incerrable que le diga al profesional[...] ASISTIÓ, NO
// ASISTIÓ[...] esta pantalla aparecerá dejando todo lo de atrás con
// blur[...] no es algo molesto ya que sucede una vez por turno y es algo
// urgente para el tema de resolución de conflictos, y a la hora de
// verificar un paciente". Montado una sola vez en app/panel/layout.tsx —
// tiene que aparecer sin importar en qué pantalla del panel esté el
// profesional en ese momento, no solo en Calendario/Turnos.
//
// Corrección de QA sobre el diseño inicial (que acotaba el sondeo a
// turnos de HOY): "el cartel siempre debe aparecer si tengo un turno
// resuelto, y no lo puedo quitar aunque cierre la app, siempre que
// vuelva es lo primero que debo ver... si hay más de uno se deben
// acumular hasta marcarlos todos" — al sacar los botones manuales de
// TurnoDetalle/TurnosTable (ya no existen en ningún otro lado), este
// cartel pasa a ser la ÚNICA forma de marcar asistencia, así que no
// puede tener ningún tope de fecha: turnosPendientesAsistenciaAction
// (turnos_pendientes_asistencia.go) no filtra por "hoy", trae CUALQUIER
// turno resuelto sin marcar, sin importar la antigüedad.
//
// A diferencia de esos botones viejos (click + confirmación simple), acá
// la marca dispara SOLA en cuanto se cumple la hora de fin — el
// profesional no elige cuándo aparece, y no puede cerrar el cartel sin
// responder (sin botón "×", sin cierre al tocar el fondo, sin tecla
// Escape).

const INTERVALO_SONDEO_MS = 30_000;

export function AsistenciaCartelGlobal() {
  const [cola, setCola] = useState<Turno[]>([]);
  const timeoutPrecisoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVueloRef = useRef(false);
  const montadoRef = useRef(true);

  // Funciones planas (sin useCallback) a propósito: este proyecto deja
  // que el React Compiler de Next.js maneje la memoización — envolverlas
  // a mano acá choca con eso ("Existing memoization could not be
  // preserved", error real de lint al escribir esto con useCallback,
  // sobre todo por la auto-referencia de sondear dentro de su propio
  // setTimeout más abajo).
  async function sondear() {
    if (enVueloRef.current) return;
    enVueloRef.current = true;
    try {
      const { vencidos, proximoVencimiento } = await turnosPendientesAsistenciaAction();
      if (!montadoRef.current) return;
      // El backend ya devuelve `vencidos` ordenado del más antiguo al
      // más nuevo — no hace falta ordenar de nuevo acá.
      setCola(vencidos);

      // Timer preciso para el PRÓXIMO turno que todavía no resolvió —
      // "en tiempo real", no "en el próximo sondeo periódico" (hasta 30s
      // de demora sería aceptable para casi cualquier otra cosa, pero acá
      // el cliente pidió explícitamente que dispare en el momento).
      if (timeoutPrecisoRef.current) {
        clearTimeout(timeoutPrecisoRef.current);
        timeoutPrecisoRef.current = null;
      }
      if (proximoVencimiento) {
        const espera = new Date(proximoVencimiento).getTime() - Date.now() + 250;
        timeoutPrecisoRef.current = setTimeout(sondear, Math.max(espera, 1000));
      }
    } finally {
      enVueloRef.current = false;
    }
  }

  useEffect(() => {
    montadoRef.current = true;
    sondear();
    const intervalo = setInterval(sondear, INTERVALO_SONDEO_MS);
    return () => {
      montadoRef.current = false;
      clearInterval(intervalo);
      if (timeoutPrecisoRef.current) clearTimeout(timeoutPrecisoRef.current);
    };
    // sondear no depende de props/estado reactivo (solo refs + el
    // setter de estado, ambos estables) — declararla en deps la
    // recrearía cada render sin ganar nada, disparando este efecto en
    // loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turnoActual = cola[0] ?? null;

  // resolver — sea cual sea el resultado (éxito, o un 409 porque otra
  // pestaña/otro dispositivo ya lo marcó primero), sacar este turno de la
  // cola local y volver a sondear: si el backend acaba de resolver un
  // ConflictoPaciente por esto (TR-107, 1.3bis), puede haber cambiado qué
  // otro turno corresponde mostrar después.
  async function resolver(valor: "asistio" | "ausente") {
    if (!turnoActual) return;
    await marcarAsistenciaAction(turnoActual.id, valor);
    setCola((prev) => prev.filter((t) => t.id !== turnoActual.id));
    sondear();
  }

  if (!turnoActual) return null;

  return <CartelConfirmacionAsistencia key={turnoActual.id} turno={turnoActual} onResolver={resolver} />;
}

function CartelConfirmacionAsistencia({
  turno,
  onResolver,
}: {
  turno: Turno;
  onResolver: (valor: "asistio" | "ausente") => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  const inicio = turno.horaInicio ? new Date(turno.horaInicio) : null;
  const fin = turno.horaFin ? new Date(turno.horaFin) : null;

  async function confirmar(valor: "asistio" | "ausente") {
    setGuardando(true);
    await onResolver(valor);
    // Sin `setGuardando(false)` acá a propósito: este componente se
    // desmonta (turnoActual cambia o pasa a null) apenas onResolver
    // termina — dejarlo en "guardando" evita un parpadeo de los botones
    // habilitados un instante antes de desaparecer.
  }

  return (
    <ModalPortal>
      {/* Sin onClick en el fondo, sin botón de cerrar, sin manejo de
          Escape — a propósito: "incerrable", el profesional tiene que
          responder para que desaparezca. */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirmar asistencia del turno"
        className="fixed inset-0 z-[70] flex items-center justify-center bg-grafito/60 p-4 backdrop-blur-md"
      >
        <div className="w-full max-w-sm rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
          <div className="border-b-[0.5px] border-arena px-6 py-4">
            <p className="text-xs uppercase tracking-widest text-grafito/50">Turno finalizado</p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-lg font-medium text-grafito">
              {turno.nombreContacto} {turno.apellidoContacto}
            </h2>
            <p className="mt-0.5 text-xs text-grafito/50">DNI {turno.dniContacto}</p>
          </div>
          <div className="flex flex-col gap-4 p-6 text-sm">
            <div>
              {inicio && <p className="text-xs uppercase tracking-widest text-grafito/50">{formatDiaLargo(inicio)}</p>}
              <p className="mt-1 font-[family-name:var(--font-mono)] text-2xl font-semibold text-grafito">
                {inicio && fin ? `${formatHora(inicio)}–${formatHora(fin)}` : "—"}
              </p>
            </div>
            <p className="text-xs text-grafito/70">¿El paciente asistió a este turno?</p>
            <p className="text-xs text-grafito/50">
              Mantené apretado un botón 10 segundos para confirmar — esta elección es irreversible.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <BotonMantenerApretado
                etiqueta="Asistió"
                claseColor="bg-salvia-oscuro"
                disabled={guardando}
                onConfirmar={() => confirmar("asistio")}
              />
              <BotonMantenerApretado
                etiqueta="No asistió"
                claseColor="bg-terracota-oscuro"
                disabled={guardando}
                onConfirmar={() => confirmar("ausente")}
              />
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

const MANTENER_APRETADO_MS = 10_000;
const INTERVALO_PROGRESO_MS = 50;

// BotonMantenerApretado — pedido textual del cliente: "hay que mantener
// apretado el botón para mostrar que no asistió o si, es decir mantenerlo
// apretado por 10 seg, viendo como se llena para que no sea una reacción
// espontánea". `setInterval` con `Date.now()` en vez de
// `requestAnimationFrame` a propósito: el resultado visual es
// prácticamente igual (actualiza cada 50ms) y así el control es
// determinista bajo fake timers en los tests, sin depender de que jsdom
// simule el reloj de animación del navegador.
function BotonMantenerApretado({
  etiqueta,
  claseColor,
  disabled,
  onConfirmar,
}: {
  etiqueta: string;
  claseColor: string;
  disabled: boolean;
  onConfirmar: () => void;
}) {
  const [progreso, setProgreso] = useState(0);
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inicioRef = useRef<number | null>(null);
  const confirmadoRef = useRef(false);

  function detenerProgreso() {
    if (intervaloRef.current !== null) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    inicioRef.current = null;
    setProgreso(0);
  }

  function iniciarProgreso() {
    if (disabled || confirmadoRef.current || intervaloRef.current !== null) return;
    inicioRef.current = Date.now();
    intervaloRef.current = setInterval(() => {
      const transcurrido = Date.now() - (inicioRef.current ?? Date.now());
      const p = Math.min(transcurrido / MANTENER_APRETADO_MS, 1);
      setProgreso(p);
      if (p >= 1) {
        if (intervaloRef.current !== null) {
          clearInterval(intervaloRef.current);
          intervaloRef.current = null;
        }
        if (!confirmadoRef.current) {
          confirmadoRef.current = true;
          onConfirmar();
        }
      }
    }, INTERVALO_PROGRESO_MS);
  }

  useEffect(
    () => () => {
      if (intervaloRef.current !== null) clearInterval(intervaloRef.current);
    },
    [],
  );

  // Bug real reportado por el cliente, 2026-09-05: "toco 10 seg pero no
  // se completa" — sin capturar el puntero, `onPointerLeave` cancelaba
  // la espera apenas el cursor se salía unos píxeles del botón durante
  // los 10 segundos (temblor de mano normal al sostener el mouse quieto
  // tanto tiempo), reiniciando el progreso a 0 en silencio — nada en
  // pantalla explicaba por qué "nunca se completaba". `setPointerCapture`
  // en el `pointerdown` es el patrón correcto para "mantener apretado":
  // una vez capturado, el botón sigue recibiendo los eventos de ESE
  // puntero pase lo que pase con el cursor hasta que se suelta de
  // verdad — por eso ya no hace falta (ni conviene) escuchar
  // `onPointerLeave`, solo `onPointerUp`/`onPointerCancel` son señales
  // reales de "se soltó".
  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    iniciarProgreso();
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    detenerProgreso();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) iniciarProgreso();
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") detenerProgreso();
      }}
      className={`relative select-none touch-none overflow-hidden rounded-field border-[0.5px] border-arena px-4 py-3 text-sm font-semibold text-marfil disabled:opacity-60 ${claseColor}`}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-marfil/30" style={{ width: `${progreso * 100}%` }} />
      <span className="relative">{etiqueta}</span>
      <span className="sr-only" role="status">
        {progreso > 0 && progreso < 1 ? `${Math.round(progreso * 100)}% mantenido` : ""}
      </span>
    </button>
  );
}
