"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PanelNotificacionesResponse } from "@dental-mirage/shared-types";
import { panelNotificacionesAction } from "@/app/actions/panel";

// NotificacionesConflictoGlobal — pedido textual del cliente: "si estoy
// afuera de la sección pacientes mostrar las notificaciones de conflicto
// en la zona [marcada en docs/foto1.png — arriba del todo, encima del
// título/toolbar de cada pantalla del panel]... si es conflicto de
// pacientes que diga tenés un conflicto con los pacientes y me envíe al
// apartado paciente, si es conflicto con turno de calendario al
// calendario". Montado una sola vez en app/panel/layout.tsx, como
// primer hijo de `<main>` — aparece en CUALQUIER pantalla del panel,
// salvo la que ya muestra su propio aviso más específico
// (ConflictosPacienteBanner en /panel/pacientes, el banner de conflicto
// del calendario en /panel/calendario) para no duplicar el mismo aviso
// dos veces en la misma pantalla.
const INTERVALO_SONDEO_MS = 60_000;

export function NotificacionesConflictoGlobal() {
  const pathname = usePathname();
  const [notificaciones, setNotificaciones] = useState<PanelNotificacionesResponse>({
    conflictosPacientes: 0,
    conflictosCalendario: 0,
  });
  const montadoRef = useRef(true);

  async function sondear() {
    const result = await panelNotificacionesAction();
    if (montadoRef.current) setNotificaciones(result);
  }

  useEffect(() => {
    montadoRef.current = true;
    sondear();
    const intervalo = setInterval(sondear, INTERVALO_SONDEO_MS);
    return () => {
      montadoRef.current = false;
      clearInterval(intervalo);
    };
  }, []);

  // Re-sondear al cambiar de pantalla: resolver un conflicto en
  // Pacientes/Calendario y volver a otra pantalla debería reflejarse de
  // inmediato, no esperar hasta el próximo sondeo de los 60s.
  useEffect(() => {
    sondear();
  }, [pathname]);

  const mostrarPacientes = notificaciones.conflictosPacientes > 0 && !pathname.startsWith("/panel/pacientes");
  const mostrarCalendario = notificaciones.conflictosCalendario > 0 && !pathname.startsWith("/panel/calendario");

  if (!mostrarPacientes && !mostrarCalendario) return null;

  // Padding propio (no delegado al layout): cada página del panel arma
  // su propio contenedor con este mismo padding horizontal (p-8/clamp),
  // así que este aviso — un hermano de esa página, no un hijo — necesita
  // el suyo para alinear con el título/toolbar de abajo, en vez de pegado
  // al borde izquierdo del sidebar (ver docs/foto1.png).
  return (
    <div className="px-8 pt-4 max-md:px-[clamp(1rem,4vw,2rem)] max-md:pt-2">
      <div className="flex flex-col gap-2">
        {mostrarPacientes && (
          <Link
            href="/panel/pacientes"
            className="flex items-center justify-between gap-3 rounded-card border-[0.5px] border-terracota bg-terracota/10 px-4 py-3 text-left text-sm font-medium text-terracota-oscuro hover:bg-terracota/15"
          >
            <span>
              Tenés {notificaciones.conflictosPacientes} {notificaciones.conflictosPacientes === 1 ? "conflicto" : "conflictos"} con los
              pacientes, tocá para ver
            </span>
          </Link>
        )}
        {mostrarCalendario && (
          <Link
            href="/panel/calendario"
            className="flex items-center justify-between gap-3 rounded-card border-[0.5px] border-terracota bg-terracota/10 px-4 py-3 text-left text-sm font-medium text-terracota-oscuro hover:bg-terracota/15"
          >
            <span>
              Tenés {notificaciones.conflictosCalendario} {notificaciones.conflictosCalendario === 1 ? "turno" : "turnos"} en conflicto en
              el calendario, tocá para ver
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
