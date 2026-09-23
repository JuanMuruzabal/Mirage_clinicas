import type { MetadataRoute } from "next";
import { urlDelSitio } from "@/lib/sitio";

// robots.txt (PE-9). Lo público se indexa (inicio, buscador, la página de
// cada clínica); las pantallas con sesión no — igual redirigen al login,
// pero así un buscador no gasta visitas ni guarda una pantalla de "Ingresá".
//
// Con `$` y con `/` al final, nunca un prefijo suelto: la página de una
// clínica vive en `/{slug}`, y "Disallow: /panel" también bloquearía una
// clínica llamada "panelli-odontologia".
//
// Dinámico por el mismo motivo que sitemap.ts: la URL del sitio se lee en
// runtime.
export const dynamic = "force-dynamic";

const PRIVADAS = [
  "panel",
  "perfil",
  "clinicas",
  "colaboradores",
  "seleccionar-servicio",
  "personalizar-pagina",
  "ingresar",
  "sumarse",
  "recuperar-password",
  "verificar-mail",
];

export default function robots(): MetadataRoute.Robots {
  const sitio = urlDelSitio();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...PRIVADAS.flatMap((ruta) => [`/${ruta}$`, `/${ruta}/`])],
    },
    sitemap: `${sitio}/sitemap.xml`,
  };
}
