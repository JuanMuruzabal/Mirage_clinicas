// Links que la página pública arma a partir de lo que cargó el admin de la
// clínica. Todo lo que sale de acá termina en un `href` o un `src` que ve
// cualquier visitante, así que NADA se interpola a ciegas: el valor de una
// red social puede ser un usuario, un número o una URL, y solo una URL
// http(s) o un handle que armamos nosotros llega a ser un link — un
// `javascript:` cargado a mano se descarta acá aunque el backend ya lo
// rechace (defensa en dos capas: el dato viejo o uno que se cuele por otro
// camino no puede volverse un link ejecutable).
import type { RedSocial } from "./modulos";

function esUrlHttp(valor: string): URL | null {
  if (!/^https?:\/\//i.test(valor)) return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Link de una red social, o `null` si el valor no da uno seguro. */
export function urlDeRedSocial(red: RedSocial | string, valor: string): string | null {
  const v = valor.trim();
  if (!v) return null;

  const url = esUrlHttp(v);
  if (url) return url.toString();
  // Con ":" y sin ser http(s) es un esquema ajeno (javascript:, data:...).
  if (v.includes(":")) return null;

  const usuario = v.replace(/^@/, "");
  switch (red) {
    case "instagram":
      return usuario ? `https://instagram.com/${encodeURIComponent(usuario)}` : null;
    case "facebook":
      return usuario ? `https://facebook.com/${encodeURIComponent(usuario)}` : null;
    case "whatsapp": {
      const digitos = v.replace(/\D/g, "");
      return digitos.length >= 8 ? `https://wa.me/${digitos}` : null;
    }
    default:
      return null;
  }
}

/** Mapa embebido de la dirección (iframe). */
export function urlDeMapaEmbebido(direccion: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(direccion)}&output=embed`;
}

/** Link a la dirección en Google Maps (nueva pestaña). */
export function urlDeComoLlegar(direccion: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

/** `tel:` para llamar, o `null` si lo cargado no parece un teléfono. */
export function hrefDeTelefono(telefono: string): string | null {
  const limpio = telefono.replace(/[^\d+]/g, "");
  return limpio.replace(/\D/g, "").length >= 6 ? `tel:${limpio}` : null;
}

/**
 * ¿Es una URL de foto que la página puede mostrar? Mismo criterio que
 * urlDeFotoValida del backend: nuestra ruta de uploads o http(s).
 */
export function esUrlDeFotoSegura(url: string): boolean {
  return url.startsWith("/uploads/") || esUrlHttp(url) !== null;
}
