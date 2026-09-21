import type { TipoConsulta } from "@dental-mirage/shared-types";

/**
 * La paleta de RECEPCIÓN — colores precargados para los tipos de consulta
 * en la vista general de la clínica (QA de la Fase 3.2.6, 2026-09-21).
 *
 * ## El problema
 *
 * Un tipo de consulta es de un profesional, y su color también: "si tu
 * colega tiene Consulta general en verde y vos en beige, en tu ficha se
 * pinta beige — un punto de color significa lo que decidió QUIEN MIRA, no
 * quien cargó" (TR-145).
 *
 * En la vista general esa regla se queda sin quien mire. Recepción no
 * tiene tipos propios, así que pintar cada turno con el color de su dueño
 * mezcla dos paletas que nadie coordinó: el verde de uno puede ser
 * "Limpieza" y el de otro "Urgencia", y el calendario deja de poder
 * leerse de un vistazo. El cliente lo dijo así: *"el recepcionista ya
 * tiene por default colores precargados en los diferentes tipos de turno,
 * así no se mezclan los colores que usa un profesional y los colores que
 * usa otro"*.
 *
 * ## La solución
 *
 * Recepción tiene su propia paleta, igual que cualquier profesional —
 * solo que no la configura: viene precargada. Se asigna **por NOMBRE**,
 * que es lo que identifica a un tipo en toda la clínica (TR-145): las dos
 * filas de "Limpieza dental" —la de cada profesional, con sus propios
 * minutos y su propio color— se ven del mismo color acá, porque para
 * recepción son la misma cosa.
 *
 * Determinista y sin estado: el mismo nombre da siempre el mismo color,
 * en cualquier pantalla y entre recargas, sin guardar nada.
 */

// Los mismos hex que ofrece el editor de tipos de consulta (Sistema
// Cascarón, TR-010/TR-013) — no colores inventados para esta pantalla.
// El orden importa: los primeros son los más distinguibles entre sí, así
// que una clínica con pocos tipos los agota antes de llegar a los tonos
// más parecidos.
export const PALETA_RECEPCION = [
  "#6E8F72", // salvia
  "#D6563A", // urgencia
  "#C97F5A", // terracota
  "#3F5943", // salvia oscuro
  "#8A4B2E", // terracota oscuro
  "#E7D9BE", // cascarón
  "#35312B", // grafito
  "#E7DFD1", // arena
];

/**
 * normalizarNombreTipo — el mismo criterio que usa el backend para decidir
 * si dos tipos son "el mismo" (sin acentos, sin mayúsculas, sin espacios
 * de más). Sin esto, "Limpieza Dental" y "limpieza dental" se pintarían
 * de colores distintos y no habría forma de darse cuenta de por qué.
 */
function normalizarNombreTipo(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * colorPrecargado — el color que le toca a un tipo de consulta en la
 * vista general, por su nombre.
 *
 * Un hash chico y estable (djb2) en vez del índice en una lista: el orden
 * en que vienen los tipos cambia con cada alta, y con un índice el
 * calendario entero se recoloreaba cuando alguien creaba un tipo nuevo.
 */
export function colorPrecargado(nombre: string): string {
  const normalizado = normalizarNombreTipo(nombre);
  let hash = 5381;
  for (let i = 0; i < normalizado.length; i++) {
    hash = ((hash << 5) + hash + normalizado.charCodeAt(i)) >>> 0;
  }
  return PALETA_RECEPCION[hash % PALETA_RECEPCION.length];
}

/**
 * conPaletaPrecargada — la lista de tipos de la clínica, repintada con la
 * paleta de recepción.
 *
 * Se aplica en la PÁGINA, sobre la lista que baja del servidor, así que
 * todo lo que hay abajo —la grilla, la vista de mes, el detalle de un
 * turno, el modal de alta— sigue resolviendo el tipo por id como siempre
 * y no necesita saber nada de esto. Lo único que cambia es de dónde sale
 * el color.
 */
export function conPaletaPrecargada(tipos: TipoConsulta[]): TipoConsulta[] {
  return tipos.map((tipo) => ({ ...tipo, color: colorPrecargado(tipo.nombre) }));
}
