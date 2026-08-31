import type { Metadata } from "next";
import { apiListTiposConsulta, apiListTurnos } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { hoyEnCordoba, rangoVisible, type VistaCalendario } from "@/lib/calendar-utils";
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
export default async function CalendarioPage({ searchParams }: PageProps<"/panel/calendario">) {
  const resolved = await searchParams;
  const vistaInicial: VistaCalendario = firstParam(resolved.vista) === "semana" ? "semana" : "dia";

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
  const { desde, hasta } = rangoVisible(hoyEnCordoba(), vistaInicial);

  const [tiposResult, turnosResult] = token
    ? await Promise.all([
        apiListTiposConsulta(token),
        apiListTurnos(token, { estado: "agendado", desde: desde.toISOString(), hasta: hasta.toISOString() }),
      ])
    : [null, null];

  const tiposConsulta = tiposResult?.ok ? tiposResult.data : [];
  const turnosIniciales = turnosResult?.ok ? turnosResult.data : [];

  return <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={turnosIniciales} vistaInicial={vistaInicial} />;
}
