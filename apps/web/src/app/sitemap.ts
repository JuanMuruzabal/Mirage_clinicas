import type { MetadataRoute } from "next";
import { apiSitemapClinicas } from "@/lib/api";
import { urlDelSitio } from "@/lib/sitio";

// sitemap.xml (PE-9): las páginas públicas que Google puede indexar — el
// inicio, el buscador y cada clínica publicada y visible, con la fecha de su
// última publicación.
//
// Dinámico a propósito: por defecto Next lo genera UNA vez en el build, y en
// el build no hay API a la que preguntarle (ni SITE_URL, ver lib/sitio.ts).
// Un buscador lo pide cada tanto; armarlo en cada pedido es barato.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitio = urlDelSitio();
  const fijas: MetadataRoute.Sitemap = [
    { url: `${sitio}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${sitio}/buscar`, changeFrequency: "daily", priority: 0.8 },
  ];
  const result = await apiSitemapClinicas();
  // Si la API no responde, igual se sirve lo fijo: un sitemap incompleto por
  // un rato es mejor que un 500, que el buscador puede tomar como "no hay".
  if (!result.ok) return fijas;
  return [
    ...fijas,
    ...result.data.map((c) => ({
      url: `${sitio}/${c.slug}`,
      lastModified: c.actualizadaEn,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
