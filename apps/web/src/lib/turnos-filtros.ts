import type { ListarTurnosParams } from "@/lib/api";
import { finDiaCordobaISO, inicioDiaCordobaISO, type RangoRapido } from "@/lib/calendar-utils";

// Extraído de app/panel/turnos/page.tsx (corrección de QA, 2026-09-06:
// "los filtros de búsqueda... pasan a aparecer cuando se toca un botón,
// aparecen de forma de bottom sheet en mobile") — la hoja de filtros
// nueva (TurnosFiltros, Client Component) necesita la MISMA lógica de
// armado de filtros que la página (Server Component) para poder pedir el
// conteo en vivo ("Ver X turnos") con los valores todavía sin confirmar
// — de ahí que viva en su propio archivo en vez de en page.tsx, para que
// los dos puedan importarla sin que uno dependa del otro.
export type Tab = "agendado" | "resuelto" | "cancelada" | "todas";

export function parseTab(value: string | undefined): Tab {
  if (value === "resuelto" || value === "cancelada" || value === "todas") return value;
  return "agendado";
}

// parseVerificacion — corrección de seguridad (Fase 2.4.1): da visibilidad
// al profesional sobre turnos de pacientes que todavía no demostraron ser
// reales (ver pacienteEstaVerificado en el backend) — mismo criterio de
// parseo defensivo que parseTab, cualquier valor que no sea uno de los dos
// esperados se trata como "sin filtro".
export function parseVerificacion(value: string | undefined): "verificado" | "sin_verificar" | undefined {
  return value === "verificado" || value === "sin_verificar" ? value : undefined;
}

// desde/hasta llegan como "YYYY-MM-DD" (URL/`<input type="date">`) — acá
// se convierten al instante RFC3339 que de verdad exige el backend (bug
// de QA, ver el comentario grande de inicioDiaCordobaISO/finDiaCordobaISO
// en lib/calendar-utils.ts).
export function filtrosDeTab(
  tab: Tab,
  q: string | undefined,
  desde: string | undefined,
  hasta: string | undefined,
  tipoConsultaId: string | undefined,
  verificacion: "verificado" | "sin_verificar" | undefined,
): ListarTurnosParams {
  const base: ListarTurnosParams = (() => {
    switch (tab) {
      case "resuelto":
        return { estado: "agendado", resuelto: true, q };
      case "agendado":
        return { estado: "agendado", resuelto: false, q };
      case "cancelada":
        return { estado: "cancelada", q };
      default:
        // "todas" — sin filtro de estado, trae agendados y cancelados juntos.
        return { q };
    }
  })();
  return {
    ...base,
    desde: desde ? inicioDiaCordobaISO(desde) : undefined,
    hasta: hasta ? finDiaCordobaISO(hasta) : undefined,
    tipoConsultaId,
    verificacion,
  };
}

// RANGOS_RAPIDOS — Extra 2.3.3 (E3.5): "filtro rápido HOY/SEMANA/MES antes
// de Desde/Hasta" — atajos que precargan Desde/Hasta con un rango ya
// calculado (rangoRapidoFechas, lib/calendar-utils.ts), en vez de que el
// profesional tenga que elegir las dos fechas a mano para el caso común.
export const RANGOS_RAPIDOS: { label: string; rango: RangoRapido }[] = [
  { label: "Hoy", rango: "hoy" },
  { label: "Semana", rango: "semana" },
  { label: "Mes", rango: "mes" },
];
