import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { urlDeMapaEmbebido } from "@/lib/pagina-publica/enlaces";

// Regresión real (2026-08-26): la CSP sin nonce en `script-src` bloqueaba
// los <script> inline que el propio Next.js App Router inyecta para
// hidratar/streamear RSC — rompía la hidratación de toda la app (texto y
// botones desaparecían, React error #412). Este test fija el contrato que
// evita que eso vuelva a pasar en silencio: la respuesta lleva un nonce en
// el header CSP, Y el mismo nonce se reenvía en el header de REQUEST
// (`x-nonce`) — ese segundo paso es el que Next.js necesita para poder
// estampar ese nonce en los scripts que genera, y es fácil de omitir por
// error al tocar este archivo (ver https://nextjs.org/docs/app/guides/content-security-policy).
describe("middleware", () => {
  it("agrega un nonce a script-src y lo reenvía en el header de request para que Next.js lo use", () => {
    const request = new NextRequest("https://dentalmirage.com.ar/");

    const response = middleware(request);

    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();

    const match = csp?.match(/script-src[^;]*'nonce-([^']+)'/);
    expect(match).not.toBeNull();
    const nonce = match?.[1];
    expect(nonce).toBeTruthy();

    // El nonce reenviado al render de Next.js (vía el request que sigue en
    // la cadena) tiene que ser exactamente el mismo que el del header CSP
    // de la respuesta — si difieren, o si falta, Next.js no puede
    // estampar sus propios scripts y la CSP los bloquea igual que en el
    // bug real.
    const forwardedRequestNonce = response.headers.get("x-middleware-request-x-nonce");
    expect(forwardedRequestNonce).toBe(nonce);
  });

  it("no usa 'unsafe-inline' en script-src (solo el nonce y los orígenes externos permitidos)", () => {
    const request = new NextRequest("https://dentalmirage.com.ar/");
    const response = middleware(request);

    const csp = response.headers.get("Content-Security-Policy") ?? "";
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));

    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).toContain("https://accounts.google.com");
    expect(scriptSrc).toContain("https://challenges.cloudflare.com");
  });

  it("genera un nonce distinto en cada request", () => {
    const nonceDe = (url: string) => {
      const csp = middleware(new NextRequest(url)).headers.get("Content-Security-Policy") ?? "";
      return csp.match(/'nonce-([^']+)'/)?.[1];
    };

    expect(nonceDe("https://dentalmirage.com.ar/")).not.toBe(nonceDe("https://dentalmirage.com.ar/"));
  });

  it("sigue mandando los demás headers de seguridad", () => {
    const request = new NextRequest("https://dentalmirage.com.ar/");
    const response = middleware(request);

    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  // Regresión real (2026-09-18, Fase 4.4/4.5): las fotos de la página pública
  // no cargaban en local porque su URL era http://localhost:8080/... — otro
  // origen y sin HTTPS. La solución fue servirlas del mismo origen, NO abrir
  // esta política: estos tests fijan las dos mitades.
  describe("CSP de la página pública (fotos y mapa)", () => {
    const directiva = (nombre: string) => {
      const csp = middleware(new NextRequest("https://dentalmirage.com.ar/")).headers.get("Content-Security-Policy") ?? "";
      return (csp.split(";").find((d) => d.trim().startsWith(nombre)) ?? "").trim().split(/\s+/).slice(1);
    };

    it("img-src permite el mismo origen y https, y NO un origen http (ni localhost)", () => {
      const imgSrc = directiva("img-src");
      expect(imgSrc).toContain("'self'");
      expect(imgSrc).toContain("https:");
      expect(imgSrc.some((f) => f.startsWith("http:"))).toBe(false);
      expect(imgSrc.some((f) => f.includes("localhost"))).toBe(false);
    });

    it("frame-src permite el embed de Google Maps que arma urlDeMapaEmbebido", () => {
      const { origin, pathname } = new URL(urlDeMapaEmbebido("Av. Colón 100"));
      // Una fuente CSP con path sin "/" final solo matchea ese path exacto:
      // si el embed pasara a otra ruta (/maps/embed, por ejemplo), este test
      // falla en vez de romper el mapa en producción sin que nadie lo vea.
      expect(directiva("frame-src")).toContain(`${origin}${pathname}`);
    });

    it("frame-src no habilita todo google.com, solo Maps, y conserva los orígenes de login y captcha", () => {
      const frameSrc = directiva("frame-src");
      expect(frameSrc).not.toContain("https://www.google.com");
      expect(frameSrc).not.toContain("https:");
      expect(frameSrc).toContain("https://accounts.google.com");
      expect(frameSrc).toContain("https://challenges.cloudflare.com");
    });
  });
});
