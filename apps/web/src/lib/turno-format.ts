import type { TipoConsulta, Turno } from "@dental-mirage/shared-types";

// Rótulos/formato de turno compartidos entre TurnosTable (T3.3) y la
// tabla de historial de la ficha de paciente (T3.6) — un solo lugar, para
// no repetir el mismo diccionario en dos componentes.

// "Pendiente" y no "Confirmado" (2026-09-19, pedido del cliente: "el
// estado confirmado pasa a llamarse pendiente, ya que tiene más sentido
// porque el turno está pendiente a realizarse"). Es un cambio de RÓTULO:
// el valor de la base sigue siendo `agendado`, y la URL de la pestaña
// sigue siendo `?estado=agendado` (los links compartidos no se rompen).
//
// No confundir con el estado `pendiente` que TR-104 eliminó del modelo:
// aquél era un turno SIN horario fijo recién llegado del formulario
// público, y no existe más. Este "Pendiente" es un turno con día y hora,
// confirmado, que todavía no se atendió.
export const ESTADO_LABEL: Record<Turno["estado"], string> = {
  agendado: "Pendiente",
  cancelada: "Cancelada",
};

// Nunca cascarón/urgencia acá — TR-010 en docs/Arquitectura y base/tradeoffs.md los reserva
// exclusivamente para el bloque de tipo_consulta del calendario. Salvia
// (TR-013, piel cálida del panel) se usa para el estado del turno con
// significado explícito — confirmado = "ok" = salvia — además de la marca
// de cuadrante de al lado (4 llenos = agendado, tachado = cancelada),
// nunca el color solo.
export const ESTADO_CLASS: Record<Turno["estado"], string> = {
  agendado: "font-semibold text-salvia-oscuro",
  cancelada: "text-grafito/50",
};

// EstadoDeTurno — el estado que VE el profesional, que no es la columna
// `estado` de la base (2026-09-19).
//
// La base guarda dos valores, `agendado` y `cancelada`. Lo que la
// pantalla necesita decir son cuatro cosas, y las otras dos salen del
// RELOJ, no de una columna:
//
//   - `pendiente`  — confirmado, todavía no empezó.
//   - `en_proceso` — estamos dentro de su horario de atención.
//   - `resuelto`   — su hora de fin ya pasó.
//   - `cancelada`  — el único que sí es un valor guardado.
//
// Derivado y no persistido a propósito: un turno está "en proceso"
// porque son las 10:20 y va de 10:15 a 10:45, no porque alguien lo haya
// marcado. Guardarlo obligaría a un trabajo periódico que cambie filas
// solo —y la pantalla igual no se enteraría hasta el siguiente sondeo—,
// mientras que derivarlo hace que la fila cambie sola en la pantalla que
// ya está abierta, que es justo lo que se pidió.
//
// `ahora` se recibe en vez de leer `Date.now()` adentro: así el llamador
// puede pasar un reloj que él mismo refresca (la tarjeta de "Turnos de
// hoy" lo hace cada 30 s) y los tests no dependen de la hora real.
export type EstadoDeTurno = "pendiente" | "en_proceso" | "resuelto" | "cancelada";

export function estadoDeTurno(
  turno: Pick<Turno, "estado" | "horaInicio" | "horaFin">,
  ahora: number = Date.now(),
): EstadoDeTurno {
  if (turno.estado === "cancelada") return "cancelada";
  const fin = turno.horaFin ? new Date(turno.horaFin).getTime() : null;
  const inicio = turno.horaInicio ? new Date(turno.horaInicio).getTime() : null;
  if (fin !== null && fin <= ahora) return "resuelto";
  if (inicio !== null && fin !== null && inicio <= ahora) return "en_proceso";
  return "pendiente";
}

export const ESTADO_DERIVADO_LABEL: Record<EstadoDeTurno, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
  cancelada: "Cancelada",
};

// El azul (`acero`) es exclusivo de "en proceso": es el único estado que
// pide mirar AHORA, y tener su propio color es lo que lo hace saltar
// dentro de una lista donde todo lo demás está en verde. Ver el
// comentario de `--color-acero` en globals.css.
export const ESTADO_DERIVADO_CLASS: Record<EstadoDeTurno, string> = {
  pendiente: "font-semibold text-salvia-oscuro",
  en_proceso: "font-semibold text-acero-oscuro",
  resuelto: "font-semibold text-grafito/60",
  cancelada: "text-grafito/50",
};

// La versión pastilla, para la tarjeta de "Turnos de hoy".
export const ESTADO_DERIVADO_PILL: Record<EstadoDeTurno, string> = {
  pendiente: "bg-salvia-claro text-salvia-oscuro",
  en_proceso: "bg-acero-claro text-acero-oscuro",
  resuelto: "bg-arena text-grafito/70",
  cancelada: "bg-arena text-grafito/50",
};

export interface TemaTipoConsulta {
  /** Relleno de la tarjeta — par con contraste AA junto a `texto`. */
  fondo: string;
  /** El mismo color, más claro: el bloque de post-consulta pegado abajo.
   *  Sólido y no `opacity`, que apagaba el color y dejaba ver la grilla. */
  fondoPost: string;
  /** Contorno: separa una tarjeta de la de al lado sin transparencia. */
  borde: string;
  /** Texto oscuro sobre `fondo` — mezclado con negro para que aguante
   *  cualquier color que el profesional elija, ver TR-013. */
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
// MÁS COLOR Y CERO OPACIDAD (QA de la 3.2.6, 2026-09-21: *"hacer el color
// más vibrante y evitar opacidad en las tarjetas, hacerlas más llamativas
// y lindas a la vista"*).
//
// El relleno era un 25% del color sobre blanco: a esa altura dos tipos de
// consulta distintos se distinguían apenas, y el calendario entero se
// leía como una sola mancha beige. Sube a 55%, que es donde el color
// empieza a identificar de un vistazo sin comerse el texto.
//
// `borde` es nuevo y hace el trabajo que antes intentaba la opacidad:
// separa la tarjeta de su vecina con un tono más saturado del MISMO
// color, en vez de con transparencia. La opacidad, además de apagar, deja
// ver lo que hay detrás —la grilla de horas— y ensucia.
//
// `fondoPost` reemplaza al `opacity: 0.45` del bloque de post-consulta:
// el mismo color, mezclado a mano con blanco, da un tono sólido y
// predecible en vez de uno que depende de lo que haya debajo.
//
// El texto se mezcla con negro y no con el color puro: tiene que seguir
// leyéndose sobre cualquier color que el profesional elija, incluido uno
// oscuro.
export function temaTipoConsulta(tipo: Pick<TipoConsulta, "color"> | undefined): TemaTipoConsulta {
  if (!tipo?.color) {
    return {
      fondo: "var(--color-arena)",
      fondoPost: "var(--color-hueso)",
      borde: "var(--color-linea)",
      texto: "var(--color-grafito)",
      acento: "var(--color-arena)",
    };
  }
  return {
    fondo: `color-mix(in srgb, ${tipo.color} 55%, white)`,
    fondoPost: `color-mix(in srgb, ${tipo.color} 24%, white)`,
    borde: `color-mix(in srgb, ${tipo.color} 78%, white)`,
    texto: `color-mix(in srgb, ${tipo.color} 72%, black)`,
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
