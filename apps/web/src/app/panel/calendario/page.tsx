import type { Metadata } from "next";
import { apiListTiposConsulta, apiListTurnos } from "@/lib/api";
import { getSessionToken, requireOnboardingComplete } from "@/lib/session";
import { datosDeLaVista } from "@/lib/vista-de-recepcion";
import { conPaletaPrecargada } from "@/lib/paleta-recepcion";
import {
  hoyEnCordoba,
  parseFechaISOLocal,
  rangoVisible,
  type VistaCalendario,
} from "@/lib/calendar-utils";
import { CalendarView } from "@/components/panel/calendar-view";

export const metadata: Metadata = { title: "Calendario — PRISMA" };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// T2.3: el Server Component solo resuelve la carga inicial (semana
// actual) — la navegación entre semanas/meses la maneja CalendarView
// (cliente) pidiendo de nuevo vía Server Action, sin recargar la página.
//
// `?vista=semana` (rediseño 2026-08-27, pedido explícito del cliente:
// "turnos próximos [en General] al calendario de semana
// donde sea visible el primer turno más próximo") — la tarjeta "Turnos
// próximos" del dashboard linkea acá con este parámetro; sin él, el
// default sigue siendo "Hoy" (día), sin cambios.
//
// `?fecha=YYYY-MM-DD`/`?turno=<id>`/`?bloqueo=<id>` (F2.3 extra ítem 1,
// docs/Arquitectura y base/implementation-plan.md §11.5): deep-link desde una fila de las
// tarjetas "Turnos de hoy"/"Turnos próximos"/"Horarios reservados" del
// dashboard — `fecha` ancla la semana/día inicial a la fecha REAL del
// turno/horario reservado (sin esto, "Turnos próximos" siempre caía en
// la semana actual, nunca en la del turno si era más adelante); `turno`
// le dice a CalendarView que abra el detalle de ese turno apenas cargan
// los datos, mismo patrón que `turno` en /panel/turnos (TurnosTable/
// abrirId); `bloqueo` hace lo mismo para el "Ver eventos" de un horario
// reservado (o del cluster de solapamiento al que pertenezca).
export default async function CalendarioPage({
  searchParams,
}: PageProps<"/panel/calendario">) {
  const resolved = await searchParams;
  const vistaInicial: VistaCalendario =
    firstParam(resolved.vista) === "semana" ? "semana" : "dia";
  const fechaParam = firstParam(resolved.fecha);
  const turnoAFocalizarId = firstParam(resolved.turno);
  // posicionar (corrección de QA, 2026-09-08): "Ver calendario ->" de
  // las tarjetas "Turnos de hoy"/"Turnos próximos" del dashboard — a
  // diferencia de `turno` (deep-link de UNA FILA puntual, que abre el
  // detalle), este solo UBICA el calendario con ese turno a la vista,
  // sin abrir nada.
  const turnoAPosicionar = firstParam(resolved.posicionar);
  const bloqueoAFocalizarId = firstParam(resolved.bloqueo);

  const token = await getSessionToken();
  // El rango pedido acá tiene que coincidir con la vista inicial real
  // (arriba), si no el primer paint trae de más (o de menos) hasta que
  // el efecto del cliente vuelve a pedir el rango correcto.
  // hoyEnCordoba() (encontrado investigando un error de hidratación de
  // React, 2026-08-30), no `new Date()`: este Server Component corre en
  // el container (UTC) — sin anclar a Córdoba, durante la noche argentina
  // (cuando UTC ya rodó al día siguiente) este primer paint traía los
  // turnos de MAÑANA como si fueran "hoy", hasta que el efecto del
  // cliente (que sí calcula bien "hoy") pedía de nuevo el rango correcto
  // — un flash de datos equivocados, no solo un problema de hidratación.
  const fechaInicial = fechaParam
    ? parseFechaISOLocal(fechaParam)
    : hoyEnCordoba();
  const { desde, hasta } = rangoVisible(fechaInicial, vistaInicial);

  const [tiposResult, turnosResult] = token
    ? await Promise.all([
        apiListTiposConsulta(token),
        apiListTurnos(token, {
          estado: "agendado",
          desde: desde.toISOString(),
          hasta: hasta.toISOString(),
        }),
      ])
    : [null, null];

  const tiposConsulta = tiposResult?.ok ? tiposResult.data : [];
  const turnosIniciales = turnosResult?.ok ? turnosResult.data : [];

  const sesion = await requireOnboardingComplete();
  const { profesionales, vista, esRecepcion } = await datosDeLaVista(
    token,
    sesion.roles,
  );
  // Una columna por profesional SOLO en la vista general: parada en la
  // agenda de alguien, recepción ve el calendario de siempre.
  const enVistaGeneral = esRecepcion && vista?.profesional == null;

  // LA PALETA DE RECEPCIÓN (QA de la 3.2.6, 2026-09-21).
  //
  // En la vista general el color no puede salir del dueño de cada tipo:
  // son paletas que nadie coordinó entre sí, y el verde de uno puede ser
  // "Limpieza" mientras el de otro es "Urgencia". Recepción tiene la
  // suya, precargada y asignada por NOMBRE, así que las dos filas de
  // "Limpieza dental" —la de cada profesional— se ven del mismo color.
  //
  // Se repinta acá, sobre la lista que baja del servidor: todo lo que
  // hay abajo sigue resolviendo el tipo por id como siempre.
  const tiposParaLaVista = enVistaGeneral
    ? conPaletaPrecargada(tiposConsulta)
    : tiposConsulta;

  return (
    <CalendarView
      tiposConsulta={tiposParaLaVista}
      turnosIniciales={turnosIniciales}
      vistaInicial={vistaInicial}
      // El string crudo, no `fechaInicial` (el Date de arriba, que
      // solo sirve para EL PROPIO cálculo de rango de este Server
      // Component) — ver el comentario grande en calendar-view.tsx sobre
      // por qué un Date no puede cruzar a un Client Component acá.
      fechaInicialStr={fechaParam}
      turnoAFocalizarId={turnoAFocalizarId}
      turnoAPosicionar={turnoAPosicionar}
      bloqueoAFocalizarId={bloqueoAFocalizarId}
      profesionalesDelDia={enVistaGeneral ? profesionales : []}
      // El selector lo DIBUJA CalendarView, no esta página: lo que puede
      // ofrecer depende de Día/Semana/Mes, y esa es su decisión (ver el
      // comentario de `cambiarVista`). Acá solo viajan los datos.
      zonaProfesional={esRecepcion ? { profesionales, vista } : null}
      // De quién es la vista: lo que hace que el calendario vuelva a
      // pedir los turnos al cambiar de profesional, en cualquier fecha.
      vistaKey={vista?.profesional?.userId ?? "general"}
    />
  );
}
