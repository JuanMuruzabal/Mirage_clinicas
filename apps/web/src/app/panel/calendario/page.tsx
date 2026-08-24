import type { Metadata } from "next";
import { apiListTiposConsulta, apiListTurnos } from "@/lib/api";
import { getSessionToken } from "@/lib/session";
import { rangoVisible } from "@/lib/calendar-utils";
import { CalendarView } from "@/components/panel/calendar-view";

export const metadata: Metadata = { title: "Calendario — Dental Mirage" };

// T2.3: el Server Component solo resuelve la carga inicial (semana
// actual) — la navegación entre semanas/meses la maneja CalendarView
// (cliente) pidiendo de nuevo vía Server Action, sin recargar la página.
export default async function CalendarioPage() {
  const token = await getSessionToken();
  // La vista inicial del calendario es "Hoy" (día) — el rango pedido acá
  // tiene que coincidir con esa vista por defecto (CalendarView), si no el
  // primer paint trae de más (o de menos) hasta que el efecto del cliente
  // vuelve a pedir el rango correcto.
  const { desde, hasta } = rangoVisible(new Date(), "dia");

  const [tiposResult, turnosResult] = token
    ? await Promise.all([
        apiListTiposConsulta(token),
        apiListTurnos(token, { estado: "agendado", desde: desde.toISOString(), hasta: hasta.toISOString() }),
      ])
    : [null, null];

  const tiposConsulta = tiposResult?.ok ? tiposResult.data : [];
  const turnosIniciales = turnosResult?.ok ? turnosResult.data : [];

  return <CalendarView tiposConsulta={tiposConsulta} turnosIniciales={turnosIniciales} />;
}
