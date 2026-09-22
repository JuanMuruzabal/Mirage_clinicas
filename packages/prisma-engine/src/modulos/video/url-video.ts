export type ProveedorVideo = "youtube" | "vimeo";

export interface VideoEmbedSeguro {
  proveedor: ProveedorVideo;
  id: string;
  src: string;
}

/** Convierte enlaces públicos de YouTube/Vimeo en embeds de orígenes fijos. */
export function videoEmbedSeguro(valor: string): VideoEmbedSeguro | null {
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
    if (url.pathname === "/watch") {
      const candidato = url.searchParams.get("v");
      id = candidato && /^[A-Za-z0-9_-]{11}$/.test(candidato) ? candidato : null;
    } else {
      const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/);
      id = match?.[1] ?? null;
    }
    return id ? { proveedor: "youtube", id, src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "youtu.be") {
    const match = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
    id = match?.[1] ?? null;
    return id ? { proveedor: "youtube", id, src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }

  if (["vimeo.com", "www.vimeo.com"].includes(host)) {
    const match = url.pathname.match(/^\/([0-9]{1,12})\/?$/);
    id = match?.[1] ?? null;
  } else if (host === "player.vimeo.com") {
    const match = url.pathname.match(/^\/video\/([0-9]{1,12})\/?$/);
    id = match?.[1] ?? null;
  }
  return id ? { proveedor: "vimeo", id, src: `https://player.vimeo.com/video/${id}` } : null;
}
