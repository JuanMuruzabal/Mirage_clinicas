import type { AperturaDeNotificacion, Notificacion } from "@dental-mirage/shared-types";

// Lo que la bandeja de notificaciones (TR-179) necesita calcular sin
// dibujar nada: textos, fechas y adónde lleva "Ver turno". Funciones puras,
// para probarlas sin montar el panel.

const ZONA = "America/Argentina/Cordoba";

const formatoFechaLarga = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const formatoHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const formatoDia = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "numeric" });
const formatoMesCorto = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, month: "short" });
const formatoDiaSemanaCorto = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, weekday: "short" });
const formatoFechaCorta = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "numeric", month: "short" });

function fecha(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sinPunto(texto: string): string {
  return texto.replace(/\.$/, "");
}

/** "lunes 3 de junio" */
export function fechaLarga(iso: string | undefined): string {
  const d = fecha(iso);
  return d ? formatoFechaLarga.format(d).replace(",", "") : "";
}

/** "10:00" */
export function hora(iso: string | undefined): string {
  const d = fecha(iso);
  return d ? formatoHora.format(d) : "";
}

/** "10:00 a 10:30" */
export function rangoHorario(inicio: string | undefined, fin: string | undefined): string {
  const desde = hora(inicio);
  const hasta = hora(fin);
  if (!desde) return "";
  return hasta ? `${desde} a ${hasta}` : desde;
}

/** Las partes del sello de fecha de la tarjeta: "LUN", "3", "JUN". */
export function selloDeFecha(iso: string | undefined): { diaSemana: string; dia: string; mes: string } | null {
  const d = fecha(iso);
  if (!d) return null;
  return {
    diaSemana: sinPunto(formatoDiaSemanaCorto.format(d)).toUpperCase(),
    dia: formatoDia.format(d),
    mes: sinPunto(formatoMesCorto.format(d)).toUpperCase(),
  };
}

/** Cuándo llegó: "Recién", "Hace 5 min", "Hace 2 h", "Ayer", "12 sep". */
export function haceCuanto(iso: string, ahora: number): string {
  const d = fecha(iso);
  if (!d) return "";
  const minutos = Math.floor((ahora - d.getTime()) / 60_000);
  if (minutos < 1) return "Recién";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  if (horas < 48) return "Ayer";
  return sinPunto(formatoFechaCorta.format(d));
}

/** El número de la campana: más de 9 no suma información y rompe el círculo. */
export function numeroDeLaCampana(nuevas: number): string {
  if (nuevas <= 0) return "";
  return nuevas > 9 ? "9+" : String(nuevas);
}

/** El rótulo chico de arriba de la tarjeta: quién o qué avisa. */
export function tituloDe(n: Notificacion): string {
  if (n.tipo === "bienvenida") return "PRISMA";
  return "Turno nuevo";
}

/** La línea destacada: en un turno, el paciente. */
export function principalDe(n: Notificacion): string {
  if (n.tipo === "bienvenida") return "Te damos la bienvenida";
  return n.datos.pacienteNombre ?? "";
}

/** La línea que se lee sin abrir la tarjeta, debajo de la destacada. */
export function resumenDe(n: Notificacion): string {
  if (n.tipo === "bienvenida") return "Acá te avisamos de los turnos que entran solos.";
  const partes = [hora(n.datos.horaInicio), n.datos.clinicaNombre].filter(Boolean);
  return partes.join(" · ");
}

/**
 * Adónde lleva "Ver turno", según cómo está el turno HOY (lo resuelve el
 * backend en "abrir"): el calendario en ese día con el detalle abierto; la
 * lista de canceladas si lo cancelaron; el inicio de clínicas si ya no
 * trabajás ahí. `null` = no hay adónde ir (la bienvenida).
 */
export function destinoDeApertura(a: AperturaDeNotificacion): string | null {
  if (a.tipo !== "turno_nuevo") return null;
  if (a.sinAcceso) return "/clinicas";
  if (!a.turnoId || !a.estadoTurno) return "/panel/calendario?vista=dia";
  const turno = encodeURIComponent(a.turnoId);
  if (a.estadoTurno === "cancelada") return `/panel/turnos?estado=cancelada&turno=${turno}`;
  const dia = a.fecha ? `&fecha=${encodeURIComponent(a.fecha)}` : "";
  return `/panel/calendario?vista=dia${dia}&turno=${turno}`;
}

/** La clave VAPID viene en base64url; el navegador la quiere en bytes. */
export function claveDeServidorEnBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
