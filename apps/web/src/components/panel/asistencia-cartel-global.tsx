"use client";

import { useEffect, useRef, useState } from "react";
import type { Turno } from "@dental-mirage/shared-types";
import { marcarAsistenciaAction, turnosPendientesAsistenciaAction } from "@/app/actions/turnos";
import { formatDiaLargo, formatHora } from "@/lib/calendar-utils";
import { BotonMantenerApretado, MANTENER_APRETADO_MS } from "./boton-mantener-apretado";
import { ModalPortal } from "./modal-portal";

// AsistenciaCartelGlobal — TR-107 (1.3ter en docs/Fases post MVP/Fase 2/turnero_pagina/ArquitecturaPeticionesTurno.md),
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
  // Por qué el backend no dejó marcar el turno de arriba de la cola.
  const [error, setError] = useState<string | null>(null);
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

  // resolver — corrección del 2026-09-15, bug reportado por el cliente:
  // "se reinicia la pantalla y queda trabado".
  //
  // Antes se descartaba el resultado y se sacaba el turno de la cola
  // siempre. Si el backend rechazaba (un conflicto de identidad sin
  // resolver, por ejemplo), el sondeo lo traía de vuelta y el cartel
  // reaparecía — y como es INCERRABLE a propósito, un rechazo se
  // convertía en un bucle infinito sin ninguna explicación en pantalla.
  //
  // Ahora el error se muestra y el turno se queda en la cola: un cartel
  // que no se puede cerrar tiene que decir por qué no avanza, o no es un
  // cartel, es una trampa.
  async function resolver(valor: "asistio" | "ausente") {
    if (!turnoActual) return;
    const resultado = await marcarAsistenciaAction(turnoActual.id, valor);
    // `resultado &&` no es defensa de más: este cartel no se puede
    // cerrar, así que cualquier forma inesperada de la respuesta tiene
    // que terminar en un mensaje, nunca en una excepción que deje los
    // botones muertos.
    if (resultado && "error" in resultado && resultado.error) {
      setError(resultado.error);
      return;
    }
    setError(null);
    setCola((prev) => prev.filter((t) => t.id !== turnoActual.id));
    sondear();
  }

  if (!turnoActual) return null;

  return <CartelConfirmacionAsistencia key={turnoActual.id} turno={turnoActual} error={error} onResolver={resolver} />;
}

function CartelConfirmacionAsistencia({
  turno,
  error,
  onResolver,
}: {
  turno: Turno;
  /** Por qué el backend no dejó marcar. Sin esto, el cartel se recarga en silencio. */
  error: string | null;
  onResolver: (valor: "asistio" | "ausente") => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  const inicio = turno.horaInicio ? new Date(turno.horaInicio) : null;
  const fin = turno.horaFin ? new Date(turno.horaFin) : null;

  async function confirmar(valor: "asistio" | "ausente") {
    setGuardando(true);
    await onResolver(valor);
    // Se vuelve a habilitar SOLO si el cartel sigue en pantalla, que
    // ahora pasa cuando el backend rechazó: hay que poder reintentar
    // después de resolver lo que lo frenaba. En el camino feliz este
    // componente se desmonta apenas onResolver termina, así que este
    // setState no llega a provocar el parpadeo que el comentario
    // anterior evitaba.
    setGuardando(false);
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
            {/* Los segundos salen de la constante, no de una cadena a
                mano: el número se bajó de 10 a 5 el 2026-09-19 y este
                texto habría quedado mintiendo. */}
            <p className="text-xs text-grafito/50">
              Mantené apretado un botón {MANTENER_APRETADO_MS / 1000} segundos para confirmar — esta elección es
              irreversible.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <BotonMantenerApretado
                etiqueta="Asistió"
                claseColor="bg-salvia-oscuro"
                className="px-4 py-3 text-sm"
                disabled={guardando}
                onConfirmar={() => confirmar("asistio")}
              />
              <BotonMantenerApretado
                etiqueta="No asistió"
                claseColor="bg-terracota-oscuro"
                className="px-4 py-3 text-sm"
                disabled={guardando}
                onConfirmar={() => confirmar("ausente")}
              />
            </div>
            {/* Por qué no avanzó. Este cartel no se puede cerrar: si el
                backend rechaza y no se dice nada, el profesional queda
                apretando botones que no hacen nada. */}
            {error && (
              <p role="alert" className="rounded-field bg-terracota-claro px-3 py-2 text-xs text-terracota-oscuro">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
