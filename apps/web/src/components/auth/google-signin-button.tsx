"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { googleLoginAction, googleStateAction } from "@/app/actions/auth";
import { GoogleIcon } from "./google-icon";

// Google Identity Services, flujo popup + Authorization Code (decisión #1
// del plan aprobado — mismo patrón ya validado en producción por
// Marcuzzi_Madryn, ver docs/tradeoffs.md TR-038): el `code` viaja a
// googleLoginAction, que lo manda a apps/api para el intercambio
// server-to-server. El `state` se pide a googleStateAction justo antes de
// cada intento — nunca se reutiliza uno viejo (spec §7).
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: "popup";
            redirect_uri: string;
            callback: (response: { code?: string; error?: string }) => void;
          }) => { requestCode: () => void };
        };
      };
    };
  }
}

// Sin GOOGLE_CLIENT_ID configurado, el botón no se renderiza — mismo
// criterio nil-disabled que el resto de las dependencias externas
// (Turnstile, Resend, etc.) del lado del backend. El client ID no es un
// secreto (viaja al navegador en cualquier integración de Google), a
// diferencia del client secret, que nunca sale de apps/api.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function GoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  // Lazy initializer (no efecto para el caso "ya está cargado") — evita
  // el patrón "setState síncrono dentro de un efecto" que el compilador
  // de React desaconseja (cascading renders).
  const [scriptListo, setScriptListo] = useState(() => typeof window !== "undefined" && !!window.google?.accounts?.oauth2);
  const [pending, setPending] = useState(false);
  const clientRef = useRef<{ requestCode: () => void } | null>(null);
  const stateRef = useRef("");

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || scriptListo) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptListo(true);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [scriptListo]);

  const iniciar = useCallback(async () => {
    if (!scriptListo || !window.google || !GOOGLE_CLIENT_ID) return;
    setPending(true);

    const stateResult = await googleStateAction();
    if ("error" in stateResult) {
      onError(stateResult.error);
      setPending(false);
      return;
    }
    stateRef.current = stateResult.state;

    if (!clientRef.current) {
      clientRef.current = window.google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: "openid email profile",
        ux_mode: "popup",
        redirect_uri: "postmessage",
        callback: async (response) => {
          if (!response.code) {
            onError("No se pudo completar el inicio de sesión con Google.");
            setPending(false);
            return;
          }
          const result = await googleLoginAction({ code: response.code, state: stateRef.current });
          // Si googleLoginAction tuvo éxito, ya redirigió y esta línea no
          // se alcanza a ejecutar.
          if (result?.error) {
            onError(result.error);
          }
          setPending(false);
        },
      });
    }
    clientRef.current.requestCode();
  }, [scriptListo, onError]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <button
      type="button"
      onClick={iniciar}
      disabled={!scriptListo || pending}
      className="flex items-center justify-center gap-2.5 rounded-full border-[0.5px] border-arena bg-marfil px-4 py-2.5 text-sm font-medium text-grafito hover:border-salvia disabled:opacity-60"
    >
      <GoogleIcon />
      {pending ? "Conectando…" : "Continuar con Google"}
    </button>
  );
}
