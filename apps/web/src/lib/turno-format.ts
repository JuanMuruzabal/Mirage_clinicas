import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";

// Rótulos/formato de turno compartidos entre TurnosTable (T3.3) y la
// tabla de historial de la ficha de paciente (T3.6) — un solo lugar, para
// no repetir el mismo diccionario en dos componentes.

export const ESTADO_LABEL: Record<Turno["estado"], string> = {
  pendiente: "Pendiente",
  agendado: "Confirmado",
  cancelada: "Cancelada",
};

// Nunca cascarón/urgencia acá — TR-010 en docs/tradeoffs.md los reserva
// exclusivamente para el bloque de tipo_consulta del calendario. Salvia y
// terracota (TR-013, piel cálida del panel) sí se usan para el estado del
// turno con significado explícito — confirmado = "ok" = salvia, pendiente
// = alerta suave = terracota — además de la marca de cuadrante de al lado
// (1 lleno = pendiente, 4 llenos = agendado, tachado = cancelada), nunca
// el color solo.
export const ESTADO_CLASS: Record<Turno["estado"], string> = {
  pendiente: "font-semibold text-terracota-oscuro",
  agendado: "font-semibold text-salvia-oscuro",
  cancelada: "text-grafito/50",
};

export interface TemaTipoConsulta {
  /** Fondo pastel — bloques del calendario (par con contraste AA junto a `texto`). */
  fondo: string;
  /** Texto/borde oscuro sobre `fondo` — 6.7:1 mínimo, ver TR-013. */
  texto: string;
  /** Versión saturada — puntos/indicadores decorativos, no portan texto encima. */
  acento: string;
}

// temaTipoConsulta — resuelve el tema de color de un tipo de consulta en
// la piel cálida del panel (TR-013): reemplaza el hex crudo que trae la
// API (tipo.color, sembrado en TR-001 con cascarón/urgencia, el Sistema
// Cascarón) por los acentos nuevos — salvia para "Consulta general",
// terracota para cualquier otro tipo (Urgencia u otros que se agreguen).
// Deliberado: cambio de piel solo en apps/web, sin tocar el dato sembrado
// en apps/api. Expone fondo+texto en vez de un solo color porque salvia/
// terracota "medios" no llegan a 4.5:1 como texto normal contra blanco —
// los bloques de calendario usan el par pastel claro + oscuro, no el tono
// medio de tapa a tapa.
export function temaTipoConsulta(tipo: Pick<TipoConsulta, "nombre"> | undefined): TemaTipoConsulta {
  if (!tipo) {
    return { fondo: "var(--color-arena)", texto: "var(--color-grafito)", acento: "var(--color-arena)" };
  }
  const esGeneral = tipo.nombre === "Consulta general";
  return esGeneral
    ? { fondo: "var(--color-salvia-claro)", texto: "var(--color-salvia-oscuro)", acento: "var(--color-salvia)" }
    : { fondo: "var(--color-terracota-claro)", texto: "var(--color-terracota-oscuro)", acento: "var(--color-terracota)" };
}

export const ORIGEN_LABEL: Record<Turno["origen"], string> = {
  pagina_publica: "Página pública",
  manual: "Manual",
};

export function formatFechaHora(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}
