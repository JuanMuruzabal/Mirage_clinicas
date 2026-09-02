// Utilidades de fecha del calendario (T2.3) — funciones puras, sin
// dependencia de ninguna librería de fechas de terceros (alcance chico,
// no justifica sumar una dependencia nueva todavía).

export type VistaCalendario = "mes" | "semana" | "dia";

// TIMEZONE_CORDOBA — investigando un error de hidratación de React
// (#418) en /panel/calendario y /panel/turnos, 2026-08-30. Dos categorías
// de `Date` distintas conviven en este archivo, y el fix de cada una es
// distinto:
//   1) INSTANTES DE VERDAD (horaInicio/horaFin de un turno, un timestamptz
//      real de la API, ej. lo que recibe `formatHora`) — sí hay que
//      pasarles `timeZone: TIMEZONE_CORDOBA` al formatear: representan un
//      momento real y hay que convertirlo SIEMPRE a la hora de Córdoba
//      (el server, en UTC, y el navegador de cada visitante, en SU
//      timezone, deben mostrar el mismo texto para el mismo instante).
//   2) "MARCADORES DE DÍA" (dias[] de diasDeVista, `fecha`, `mesReferencia`
//      — lo que consumen formatDiaCorto/formatMesAnio/formatRangoSemana/
//      formatDiaLargo) — estos NO llevan `timeZone` explícito a propósito,
//      ver `hoyEnCordoba()` un poco más abajo para la explicación completa
//      (agregarles `timeZone` acá duplica la corrección y corre el día
//      un lugar entero para atrás — el bug real: la barra de herramientas
//      mostraba "sábado 29" en vez de "domingo 30").
// Mismo criterio de fondo que `internal/clock.Today()` en el backend
// (CLAUDE.md): los turnos son siempre hora de Córdoba.
const TIMEZONE_CORDOBA = "America/Argentina/Cordoba";

// hoyEnCordoba — "ahora", anclado a America/Argentina/Cordoba, para usar
// en vez de `new Date()` en cualquier estado que represente "el día de
// hoy" del calendario (ej. `fecha` en calendar-view.tsx). Encontrado
// junto con TIMEZONE_CORDOBA de arriba investigando el error de
// hidratación: `new Date()` da el mismo INSTANTE en el server y en el
// cliente, pero `startOfDay`/`addDays`/etc. de este archivo lo leen con
// getters LOCALES (getFullYear/getMonth/getDate) — cuál día calendario
// representa ese instante depende de la timezone AMBIENTE de quien lo
// lee. El server (UTC) y Córdoba (UTC-3) pueden estar viendo dos días de
// calendario distintos para el mismo instante real (ej. son las 23:30 en
// Córdoba: en UTC ya es el día siguiente) — el texto que arma el server
// para el HTML inicial ("sáb 29") no coincide con el que arma React al
// hidratar del lado del cliente ("dom 30"), mismatch de hidratación. Acá
// se arma un Date cuyos campos LOCALES ya representan el día de Córdoba
// (sea cual sea la timezone real del proceso que lo ejecuta) — así el
// resto de este archivo, que opera todo con esos getters locales, da el
// mismo resultado sin importar dónde corra. Mismo criterio que
// `internal/clock.Today()` en el backend (CLAUDE.md) y que
// `fechaISOLocal` (TR-074) para <input type="date">.
export function hoyEnCordoba(): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_CORDOBA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";
  return new Date(
    Number(parte("year")),
    Number(parte("month")) - 1,
    Number(parte("day")),
    Number(parte("hour")),
    Number(parte("minute")),
    Number(parte("second")),
  );
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

// Semana de lunes a domingo (convención local, no domingo-sábado).
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const dow = out.getDay(); // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(out, diff);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatHora(d: Date): string {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TIMEZONE_CORDOBA });
}

// minutosDesdeMedianocheCordoba — bug real reportado por el cliente,
// 2026-08-30: "al refrescar la página" los turnos del calendario
// aparecían corridos ~3 horas hacia abajo, y volvían a su lugar solo con
// navegar a otra pantalla y volver (o tocar "Hoy"/cambiar de vista). Esto
// es la MISMA categoría de bug que el error de hidratación ya corregido
// (formatHora/formatFechaHora con `timeZone: TIMEZONE_CORDOBA`) pero en
// un lugar que se me había pasado: `calendar-grid.tsx` calculaba el `top`
// (posición vertical en píxeles) de cada turno con `.getHours()`/
// `.getMinutes()` directo sobre un instante real (`horaInicio`) — esos
// getters son LOCALES, así que en el HTML que arma el server (container
// en UTC) ese cálculo da una posición distinta a la que arma React al
// hidratar del lado del cliente (timezone del visitante). A diferencia
// de un mismatch de TEXTO (que React detecta, avisa y corrige solo), un
// mismatch de un VALOR NUMÉRICO usado en `style` (top/height en px) no
// siempre se corrige solo en la hidratación — el valor incorrecto del
// server puede quedar pegado hasta el próximo render (de ahí que
// navegar afuera y volver, o cualquier cambio de estado que fuerce un
// re-render, "arregle" la posición). La función de abajo da la cantidad
// de minutos desde medianoche EN CÓRDOBA para un instante cualquiera,
// sin importar la timezone ambiente de quien la ejecuta — mismo criterio
// que `internal/clock.In()` en el backend (disponibilidad.go).
export function minutosDesdeMedianocheCordoba(d: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_CORDOBA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "0";
  // Algunos motores ICU devuelven "24" para la medianoche con hour12:false
  // en vez de "00" — el `% 24` lo normaliza.
  const hora = Number(parte("hour")) % 24;
  const minuto = Number(parte("minute"));
  return hora * 60 + minuto;
}

// fechaISOLocal/horaISOLocal (TR-074 en docs/tradeoffs.md, 2026-08-27) —
// "YYYY-MM-DD"/"HH:MM" en la fecha y hora LOCAL del dispositivo, para
// <input type="date"/"time"> (value/min) y como valor por defecto de
// "ahora". A diferencia de `d.toISOString().slice(...)` (que da la
// fecha/hora en UTC), esto no se adelanta un día en Argentina (UTC-3)
// durante las últimas horas del día local — bug real reportado por el
// cliente: "cuando quiero agregar un turno manual me deja ingresar horas
// pasadas" — la fecha calculada en UTC saltaba al día siguiente antes de
// medianoche local, así que una hora ya pasada HOY quedaba "en el
// futuro" respecto a esa fecha adelantada por error.
export function fechaISOLocal(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export function horaISOLocal(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// parseFechaISOLocal — inverso de fechaISOLocal (F2.3 extra ítem 1,
// docs/implementation-plan.md §11.5): construye el Date con el
// constructor LOCAL (no `new Date("YYYY-MM-DD")`, que ISO-parsea como
// UTC medianoche y corre un día para atrás en cualquier timezone
// negativo, incluida Córdoba) — así sus getters locales (getFullYear/
// getMonth/getDate, que es lo que usa rangoVisible/diasDeVista) devuelven
// exactamente el Y/M/D pedido, sea cual sea el timezone ambiente
// (servidor en UTC, navegador del profesional en la suya). Usado para
// anclar el calendario a la fecha real de un turno/horario reservado al
// llegar desde una tarjeta del dashboard ("Turnero").
export function parseFechaISOLocal(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// formatDiaCorto/formatMesAnio/formatRangoSemana/formatDiaLargo — a
// propósito SIN `timeZone: TIMEZONE_CORDOBA` acá (a diferencia de
// formatHora/formatFechaHora en turno-format.ts, que sí lo llevan).
// Encontrado de la manera difícil investigando el error de hidratación,
// 2026-08-30: estas cuatro funciones reciben "marcadores de día" (dias[]
// de diasDeVista, `fecha`, `mesReferencia`) que salen de hoyEnCordoba()/
// startOfDay/addDays — TODAS operan con getters LOCALES (getFullYear/
// getMonth/getDate), no con el instante real que representan. hoyEnCordoba()
// ya deja esos getters locales devolviendo el día de Córdoba SEA CUAL SEA
// la timezone ambiente de quien los lee (ver su comentario) — pedirle acá
// a `toLocaleDateString` que ADEMÁS reinterprete el instante subyacente
// como si fuera de Córdoba aplica la corrección DOS VECES: la fecha que
// arma `new Date(y, m, d, ...)` (constructor local) ya "vale" y=d=m en la
// timezone AMBIENTE de quien la construyó — pasarle timeZone acá reconvierte
// ese instante y lo corre un día entero para atrás (el bug real que motivó
// esta nota: la barra de herramientas mostraba "sábado 29" en vez de
// "domingo 30"). Los "instantes de verdad" (horaInicio/horaFin de un
// turno, un timestamptz real de la API) sí necesitan `timeZone` explícito
// porque a ESOS sí hay que convertirlos de UTC a hora de Córdoba; estos
// cuatro no.
export function formatDiaCorto(d: Date): string {
  return d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });
}

export function formatMesAnio(d: Date): string {
  const s = d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatRangoSemana(d: Date): string {
  const inicio = startOfWeek(d);
  const fin = addDays(inicio, 6);
  const mismomes = inicio.getMonth() === fin.getMonth();
  const opcionesInicio: Intl.DateTimeFormatOptions = mismomes ? { day: "numeric" } : { day: "numeric", month: "short" };
  return `${inicio.toLocaleDateString("es-AR", opcionesInicio)} – ${fin.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`;
}

export function formatDiaLargo(d: Date): string {
  const s = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// rangoVisible — el [desde, hasta) que hay que pedirle a la API para la
// vista actual (T2.3: el calendario solo pide el rango que se ve).
export function rangoVisible(fecha: Date, vista: VistaCalendario): { desde: Date; hasta: Date } {
  if (vista === "dia") {
    const desde = startOfDay(fecha);
    return { desde, hasta: addDays(desde, 1) };
  }
  if (vista === "semana") {
    const desde = startOfWeek(fecha);
    return { desde, hasta: addDays(desde, 7) };
  }
  // mes: de punta a punta de semana para que la grilla de 6 filas quede completa.
  const desde = startOfWeek(startOfMonth(fecha));
  const hasta = addDays(startOfWeek(endOfMonth(fecha)), 7);
  return { desde, hasta };
}

export function diasDeVista(fecha: Date, vista: VistaCalendario): Date[] {
  if (vista === "dia") return [startOfDay(fecha)];
  if (vista === "semana") {
    const inicio = startOfWeek(fecha);
    return Array.from({ length: 7 }, (_, i) => addDays(inicio, i));
  }
  const { desde, hasta } = rangoVisible(fecha, "mes");
  const dias: Date[] = [];
  for (let d = desde; d < hasta; d = addDays(d, 1)) {
    dias.push(d);
  }
  return dias;
}

export type RangoRapido = "hoy" | "semana" | "mes";

// rangoRapidoFechas — Extra 2.3.3 (E3.5, docs/implementation-plan.md
// §11.5): "filtro rápido HOY/SEMANA/MES antes de Desde/Hasta" en Turnos
// (app/panel/turnos/page.tsx) y en "Turnos activos"/"Historial" de la
// ficha de paciente (paciente-turnos-table.tsx) — un solo cálculo para
// los dos lugares, ya en "YYYY-MM-DD" (fechaISOLocal) listo para
// <input type="date">/querystring. Anclado a hoyEnCordoba(), nunca a la
// timezone ambiente de quien ejecuta el código (uno de los dos lugares
// corre en el servidor) — mismo criterio que el resto de este archivo.
export function rangoRapidoFechas(tipo: RangoRapido): { desde: string; hasta: string } {
  const hoy = hoyEnCordoba();
  if (tipo === "hoy") {
    return { desde: fechaISOLocal(hoy), hasta: fechaISOLocal(hoy) };
  }
  if (tipo === "semana") {
    const inicio = startOfWeek(hoy);
    return { desde: fechaISOLocal(inicio), hasta: fechaISOLocal(addDays(inicio, 6)) };
  }
  return { desde: fechaISOLocal(startOfMonth(hoy)), hasta: fechaISOLocal(endOfMonth(hoy)) };
}

// inicioDiaCordobaISO/finDiaCordobaISO — Extra 2.3.3 (E3.5, bug reportado
// por el cliente en QA: "hay varios turnos de hoy y al tocar hoy me dice
// que no se encontraron turnos, lo mismo con la semana y el rango de
// fechas"). `GET /turnos?desde=&hasta=` (internal/http/turnos.go) parsea
// esos parámetros con `time.RFC3339` — un "YYYY-MM-DD" suelto (lo que da
// `rangoRapidoFechas`/un `<input type="date">`) no es RFC3339 válido, así
// que el backend devolvía 400 y `listTurnosAction` lo traga en silencio
// como lista vacía ("no rompe el calendario") — de ahí el "no se
// encontraron turnos" con turnos reales en pantalla. Córdoba es UTC-3
// fijo todo el año (sin horario de verano, mismo criterio que
// TIMEZONE_CORDOBA de arriba) — el offset numérico se hardcodea acá en
// vez de convertir con un `Date` local: el RFC3339 de Go acepta un
// offset explícito como "-03:00" tal cual (layout `...Z07:00`), y así
// esto da el instante correcto sin importar en qué timezone corra el
// proceso que arma la URL (server de Next.js en Docker, típicamente UTC).
export function inicioDiaCordobaISO(fechaISO: string): string {
  return `${fechaISO}T00:00:00-03:00`;
}

export function finDiaCordobaISO(fechaISO: string): string {
  return `${fechaISO}T23:59:59-03:00`;
}

// navegar — mover la fecha de referencia un "paso" (prev/next del
// toolbar), del tamaño que corresponda a la vista activa.
export function navegar(fecha: Date, vista: VistaCalendario, direccion: 1 | -1): Date {
  if (vista === "dia") return addDays(fecha, direccion);
  if (vista === "semana") return addDays(fecha, 7 * direccion);
  return addMonths(fecha, direccion);
}
