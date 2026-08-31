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

// temaTipoConsulta — resuelve el tema de color de un tipo de consulta.
// Hasta F2.3.7 este resolver ignoraba tipo.color y mapeaba por NOMBRE
// ("Consulta general" → salvia, cualquier otro → terracota, el "Sistema
// Cascarón" de TR-010/TR-013) — tenía sentido cuando el color no era
// configurable. Desde que F2.3.7 deja elegir un color por tipo de
// consulta (tipo-consulta-form-modal.tsx, PALETA_COLORES), ese mapeo por
// nombre lo dejaba invisible: el profesional cambiaba el color en
// "Configuración de calendario" y el calendario seguía mostrando siempre
// salvia/terracota (corrección de QA, F2.3: "el color del tipo de
// consulta debe ser coherente con el de la configuración"). Ahora deriva
// fondo/texto directo de tipo.color con `color-mix()`: fondo es un tinte
// pastel (mezclado con blanco) y texto un tono oscuro (mezclado con
// negro) del MISMO color — funciona para cualquier hex de la paleta,
// clara u oscura, sin tener que mantener una tabla de contraste a mano.
export function temaTipoConsulta(tipo: Pick<TipoConsulta, "color"> | undefined): TemaTipoConsulta {
  if (!tipo?.color) {
    return { fondo: "var(--color-arena)", texto: "var(--color-grafito)", acento: "var(--color-arena)" };
  }
  return {
    fondo: `color-mix(in srgb, ${tipo.color} 25%, white)`,
    texto: `color-mix(in srgb, ${tipo.color} 65%, black)`,
    acento: tipo.color,
  };
}

export const ORIGEN_LABEL: Record<Turno["origen"], string> = {
  pagina_publica: "Página pública",
  manual: "Manual",
};

// TIMEZONE: fijo a America/Argentina/Cordoba en las dos llamadas de abajo
// (encontrado investigando un error de hidratación de React, 2026-08-30)
// — sin esto, cada `toLocale*String` usa la timezone AMBIENTE del
// entorno donde corre: el server (Next.js SSR, container en UTC) y el
// navegador de cada visitante (cualquier timezone del sistema operativo)
// no tienen por qué coincidir, así que el texto que arma el server para
// el HTML inicial no coincide con el que arma React al hidratar del
// lado del cliente — React lo detecta como mismatch (error #418) y
// descarta el markup del server. Mismo criterio que
// `internal/clock.Today()` en el backend (CLAUDE.md): toda fecha/hora
// "vigente" de la app se ancla a Argentina/Córdoba, nunca a la hora
// ambiente de donde se ejecuta el código — acá aplica igual, aunque sea
// solo para mostrar texto: los turnos son siempre hora de Córdoba,
// mostrarlos en la timezone del visitante (o del servidor) sería
// directamente incorrecto, no solo un problema de hidratación.
const TIMEZONE_CORDOBA = "America/Argentina/Cordoba";

export function formatFechaHora(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: TIMEZONE_CORDOBA })} · ${d.toLocaleTimeString(
    "es-AR",
    { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE_CORDOBA },
  )}`;
}
