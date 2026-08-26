import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Headers de seguridad globales (docs/feature-sumarte-login.md §7): CSP
// sin `unsafe-inline` donde es viable, HSTS, X-Content-Type-Options,
// Referrer-Policy, frame-ancestors — se aplican acá, a nivel de
// middleware, porque cubren TODA la app (marketing, buscador, panel,
// auth), no solo las rutas nuevas de sumarse/ingresar.
//
// La única excepción documentada a "sin unsafe-inline" es `style-src`:
// Next.js/Tailwind v4 inyectan estilos inline en el árbol de React (no
// hay forma de evitarlo sin un pipeline de nonces por request, que no
// vale la pena para este alcance) — script-src sí queda sin
// unsafe-inline.
//
// connect-src/frame-src/script-src incluyen accounts.google.com (Google
// Identity Services, popup + Authorization Code — decisión #1 del plan
// aprobado) y challenges.cloudflare.com (Turnstile, spec §7) — son los
// dos únicos orígenes externos que esta app carga a propósito. El resto
// del tráfico (API de Dental Mirage) pasa siempre por Server Actions
// same-origin (BFF, CLAUDE.md) — nunca necesita un origen externo acá.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com https://challenges.cloudflare.com",
  "frame-src https://accounts.google.com https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function middleware(request: NextRequest) {
  void request; // sin lógica por-request todavía — solo headers globales.
  const response = NextResponse.next();

  response.headers.set("Content-Security-Policy", CSP);
  // HSTS: inofensivo servirlo siempre (un navegador solo lo respeta sobre
  // HTTPS de todos modos) — evita tener que condicionar por entorno acá.
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

// Excluye assets estáticos y el propio pipeline de imágenes de Next —
// aplicar headers de seguridad a esos requests es trabajo de más sin
// beneficio real (no son documentos navegables).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
