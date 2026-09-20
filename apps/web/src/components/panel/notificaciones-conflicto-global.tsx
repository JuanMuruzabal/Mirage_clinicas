"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { PanelNotificacionesResponse } from "@dental-mirage/shared-types";
import { panelNotificacionesAction } from "@/app/actions/panel";

// NotificacionesConflictoGlobal — pedido textual del cliente: "si estoy
// afuera de la sección pacientes mostrar las notificaciones de conflicto
// en la zona [marcada en docs/foto1.png, que ya no está en el repo — arriba del todo, encima del
// título/toolbar de cada pantalla del panel]... si es conflicto de
// pacientes que diga tenés un conflicto con los pacientes y me envíe al
// apartado paciente, si es conflicto con turno de calendario al
// calendario". Montado una sola vez en app/panel/layout.tsx, como
// primer hijo de `<main>` — aparece en CUALQUIER pantalla del panel,
// salvo la que ya muestra su propio aviso más específico
// (ConflictosPacienteBanner en /panel/pacientes, el banner de conflicto
// del calendario en /panel/calendario) para no duplicar el mismo aviso
// dos veces en la misma pantalla.
// 2s (2026-09-19, pedido del cliente: el aviso tiene que irse "al menos
// 2 seg después de haber resuelto el conflicto", también cuando lo
// resolvió OTRO profesional).
//
// Para QUIEN resuelve el conflicto esto no hace falta: el
// `router.refresh()` de la pantalla ya actualiza todo al instante. Este
// sondeo es para el OTRO — una resolución alcanza a todos los tickets del
// mismo mail, así que su aviso tiene que irse sin que él haga nada.
//
// Y EL SONDEO SOLO NO ALCANZABA (2026-09-20, reportado probando de a
// dos: "el otro profesional al cual se propaga la resolución tiene que
// cambiar de pestaña para que se solucione"). Actualizaba su propio
// contador y se lo guardaba para sí — y eso dejaba DOS agujeros, no uno:
//
//   - En las pantallas donde este aviso SÍ se dibuja (/panel,
//     /panel/turnos), el cartel se iba en 2 s pero la ficha duplicada
//     seguía en la tabla de pacientes: eso sale del render del servidor.
//   - En **/panel/pacientes** —que es donde se resuelven los conflictos,
//     o sea donde los dos profesionales están mirando— no se movía NADA.
//     Este componente se esconde ahí a propósito (esa pantalla tiene su
//     propio `ConflictosPacienteBanner`), y ese banner no sondea: es
//     server data pura. Cartel y ficha esperaban los dos a que alguien
//     refrescara.
//
// Cambiar de pestaña "lo arreglaba" por accidente: la navegación es lo
// que volvía a pedir la pantalla.
//
// Ahora, cuando el sondeo ve que el conteo CAMBIÓ, además pide la
// pantalla de vuelta. El efecto de este componente corre igual en
// /panel/pacientes aunque no dibuje nada —el `return null` está después
// de los hooks—, así que el arreglo llega también ahí, que era el caso
// que importaba.
//
// 2s es barato acá y no en general: /panel/notificaciones son dos
// consultas cortas con cortocircuito (sin horarios reservados no mira un
// solo turno). No copiar este intervalo a un endpoint que liste o calcule
// disponibilidad.
//
// Mismo criterio que la presencia (TR-142): el estado vive en Postgres y
// se sondea, sin transporte nuevo.
const INTERVALO_SONDEO_MS = 2_000;

export function NotificacionesConflictoGlobal() {
  const pathname = usePathname();
  const router = useRouter();
  const [notificaciones, setNotificaciones] = useState<PanelNotificacionesResponse>({
    conflictosPacientes: 0,
    conflictosCalendario: 0,
  });
  const montadoRef = useRef(true);
  // El último conteo VISTO, para detectar el cambio. `null` hasta la
  // primera respuesta: sin eso, el salto de los ceros iniciales al
  // primer dato real contaría como cambio y dispararía un refresh en
  // cada montaje y en cada navegación, que es exactamente el trabajo de
  // más que este componente existía para evitar.
  const ultimoConteoRef = useRef<string | null>(null);

  async function sondear() {
    const result = await panelNotificacionesAction();
    if (!montadoRef.current) return;
    setNotificaciones(result);

    // Solo cuando CAMBIA, no en cada sondeo: refrescar cada 2 s sería
    // volver a renderizar la pantalla entera del servidor todo el
    // tiempo. Un cambio en el conteo es la señal barata de que hay algo
    // nuevo que mirar — hacia abajo (alguien resolvió) o hacia arriba
    // (entró un conflicto nuevo, y la ficha duplicada tiene que
    // aparecer en la tabla).
    //
    // Quien resuelve pide la pantalla dos veces —su propio
    // `router.refresh()` y este—, y se acepta: son dos renders en el
    // mismo segundo, y la alternativa (saber si la resolución fue
    // propia) pide llevar estado entre componentes que hoy no se
    // conocen.
    const huella = `${result.conflictosPacientes}/${result.conflictosCalendario}`;
    const anterior = ultimoConteoRef.current;
    ultimoConteoRef.current = huella;
    if (anterior !== null && anterior !== huella) {
      router.refresh();
    }
  }

  useEffect(() => {
    montadoRef.current = true;
    sondear();
    const intervalo = setInterval(sondear, INTERVALO_SONDEO_MS);
    // Y al volver a esta pestaña: es el momento exacto en que alguien
    // mira de nuevo, y el más probable para que algo haya cambiado
    // mientras no miraba (lo resolvió un colega, o uno mismo en otra
    // pestaña). Esperar al próximo sondeo ahí se nota.
    const alVolver = () => {
      if (document.visibilityState === "visible") sondear();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      montadoRef.current = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
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
  // al borde izquierdo del sidebar (ver docs/foto1.png, que ya no está en el repo).
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
