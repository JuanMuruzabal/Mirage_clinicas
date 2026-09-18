import { apiFetchUpload } from "@/lib/api";

// GET /uploads/{archivo} — sirve las fotos de la página pública desde el
// MISMO origen que la página (Fase 4.4, corrección del 2026-09-18).
//
// Por qué existe: el storage local devuelve la URL de cada foto subida, y
// antes era "http://localhost:8080/uploads/x.jpg" — el origen de la API, sin
// HTTPS. La CSP de esta app (`img-src 'self' data: https:`, ver
// middleware.ts) bloquea eso: otro origen y http. Servir las fotos desde acá
// resuelve el problema de raíz sin aflojar la política, y respeta la regla
// del proyecto de que el navegador nunca le habla directo a la API (BFF,
// CLAUDE.md): el servidor de Next le pide el archivo a la API por la red
// interna (API_URL) y lo devuelve.
//
// Solo hace falta con el storage local (dev). Con R2 en producción la URL
// ya es un https absoluto y este handler no interviene.

// Un archivo subido se llama <token base64url>.<extensión> (ver
// subirFotoPaginaPublicaHandler en el backend). Se acepta EXACTAMENTE esa
// forma y nada más: es lo que impide que esta ruta sea un proxy abierto a
// cualquier archivo o ruta de la API (`..`, `%2F`, subdirectorios).
const NOMBRE_DE_ARCHIVO = /^[A-Za-z0-9_-]{1,128}\.(jpg|png|webp)$/;

const CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(_request: Request, ctx: RouteContext<"/uploads/[...path]">) {
  const { path } = await ctx.params;
  if (path.length !== 1 || !NOMBRE_DE_ARCHIVO.test(path[0])) {
    return new Response("No encontrado", { status: 404 });
  }
  const nombre = path[0];

  const upstream = await apiFetchUpload(nombre);
  if (!upstream) {
    return new Response("No se pudo obtener la imagen", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("No encontrado", { status: 404 });
  }

  // El Content-Type sale de la EXTENSIÓN validada, no de lo que conteste la
  // API: esta respuesta se sirve desde nuestro origen, y un tipo que no sea
  // imagen serviría contenido activo desde acá.
  const extension = nombre.slice(nombre.lastIndexOf(".") + 1);
  const headers: Record<string, string> = {
    "Content-Type": CONTENT_TYPE[extension],
    // El nombre es un token aleatorio y el contenido no cambia nunca: un
    // archivo nuevo es un nombre nuevo. Se puede cachear para siempre.
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  const largo = upstream.headers.get("Content-Length");
  if (largo) headers["Content-Length"] = largo;

  return new Response(upstream.body, { status: 200, headers });
}
