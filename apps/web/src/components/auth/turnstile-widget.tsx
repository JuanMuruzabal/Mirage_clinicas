"use client";

import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile — CAPTCHA en registro y reset de contraseña (spec
// §7). Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada, no se renderiza
// nada y el form manda captchaToken vacío — el backend interpreta la
// ausencia de secret key de la misma forma (Turnstile deshabilitado en
// dev, ver internal/turnstile), así que ambos lados quedan consistentes
// sin código condicional extra.
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  // Lazy initializer (no efecto para el caso "ya está cargado") — evita
  // el patrón "setState síncrono dentro de un efecto" que el compilador
  // de React desaconseja.
  const [scriptListo, setScriptListo] = useState(() => typeof window !== "undefined" && !!window.turnstile);

  // Ref en vez de dependencia directa del effect de abajo: así el widget
  // no se recrea si el padre pasa una nueva referencia de función en cada
  // render (no todos memoizan el callback), sin arriesgar leer un
  // `onToken` viejo cuando de verdad se dispara. La asignación vive en un
  // efecto propio (no durante el render) — mutar un ref en el cuerpo del
  // componente rompe la regla del compilador de React.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!SITE_KEY || scriptListo) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptListo(true);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [scriptListo]);

  useEffect(() => {
    if (!scriptListo || !SITE_KEY || !containerRef.current || !window.turnstile) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(""),
    });
    return () => {
      if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
    };
  }, [scriptListo]);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} />;
}
