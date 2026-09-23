// La URL pública del sitio (PE-9): la necesitan las URLs ABSOLUTAS que un
// buscador o WhatsApp no resuelven solos — canonical, og:image, sitemap.xml,
// robots.txt y el JSON-LD.
//
// Se lee en RUNTIME, nunca en el build: la imagen Docker se construye una vez
// y las variables del servicio llegan recién al arrancar (una
// NEXT_PUBLIC_ quedaría horneada en el bundle, ver apps/web/Dockerfile). Por
// eso las rutas que la usan son dinámicas.
//
// SITE_URL es la del dominio propio (render.yaml). Sin ella, la que Render
// inyecta sola en todo servicio web (RENDER_EXTERNAL_URL, la de
// onrender.com), y en desarrollo localhost.
export function urlDelSitio(): string {
  const url = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}
