// Utilidades de fecha del calendario (T2.3) — funciones puras, sin
// dependencia de ninguna librería de fechas de terceros (alcance chico,
// no justifica sumar una dependencia nueva todavía).

export type VistaCalendario = "mes" | "semana" | "dia";

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
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
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
  const opcionesInicio: Intl.DateTimeFormatOptions = mismomes
    ? { day: "numeric" }
    : { day: "numeric", month: "short" };
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

// navegar — mover la fecha de referencia un "paso" (prev/next del
// toolbar), del tamaño que corresponda a la vista activa.
export function navegar(fecha: Date, vista: VistaCalendario, direccion: 1 | -1): Date {
  if (vista === "dia") return addDays(fecha, direccion);
  if (vista === "semana") return addDays(fecha, 7 * direccion);
  return addMonths(fecha, direccion);
}
