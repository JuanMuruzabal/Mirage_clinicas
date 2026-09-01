import type { Metadata } from "next";
import { apiListTiposConsulta, apiListTurnos } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { hoyEnCordoba, parseFechaISOLocal, rangoVisible, type VistaCalendario } from "@/lib/calendar-utils";
import { CalendarView } from "@/components/panel/calendar-view";

export const metadata: Metadata = { title: "Calendario — Dental Mirage" };

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
// docs/implementation-plan.md §11.5): deep-link desde una fila de las
// tarjetas "Turnos de hoy"/"Turnos próximos"/"Horarios reservados" del
// dashboard — `fecha` ancla la semana/día inicial a la fecha REAL del
// turno/horario reservado (sin esto, "Turnos próximos" siempre caía en
// la semana actual, nunca en la del turno si era más adelante); `turno`
// le dice a CalendarView que abra el detalle de ese turno apenas cargan
// los datos, mismo patrón que `turno` en /panel/turnos (TurnosTable/
// abrirId); `bloqueo` hace lo mismo para el "Ver eventos" de un horario
// reservado (o del cluster de solapamiento al que pertenezca).
export default async function CalendarioPage({ searchParams }: PageProps<"/panel/calendario">) {
  const resolved = await searchParams;
  const vistaInicial: VistaCalendario = firstParam(resolved.vista) === "semana" ? "semana" : "dia";
  const fechaParam = firstParam(resolved.fecha);
  const turnoAFocalizarId = firstParam(resolved.turno);
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
  const fechaInicial = fechaParam ? parseFechaISOLocal(fechaParam) : hoyEnCordoba();
  const { desde, hasta } = rangoVisible(fechaInicial, vistaInicial);

  const [tiposResult, turnosResult] = token
    ? await Promise.all([
        apiListTiposConsulta(token),
        apiListTurnos(token, { estado: "agendado", desde: desde.toISOString(), hasta: hasta.toISOString() }),
      ])
    : [null, null];

  const tiposConsulta = tiposResult?.ok ? tiposResult.data : [];
  const turnosIniciales = turnosResult?.ok ? turnosResult.data : [];

  return (
    <CalendarView
      tiposConsulta={tiposConsulta}
      turnosIniciales={turnosIniciales}
      vistaInicial={vistaInicial}
      // El string crudo, no `fechaInicial` (el Date de arriba, que
      // solo sirve para EL PROPIO cálculo de rango de este Server
      // Component) — ver el comentario grande en calendar-view.tsx sobre
      // por qué un Date no puede cruzar a un Client Component acá.
      fechaInicialStr={fechaParam}
      turnoAFocalizarId={turnoAFocalizarId}
      bloqueoAFocalizarId={bloqueoAFocalizarId}
    />
  );
}
