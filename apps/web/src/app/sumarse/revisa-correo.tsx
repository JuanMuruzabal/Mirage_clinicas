"use client";

import { useState } from "react";
import { reenviarVerificacionAction } from "@/app/actions/auth";
import { authErrorClass, authSubmitClass, authSuccessClass } from "@/components/auth/auth-shell";

// "Revisá tu correo" (spec §4 Paso 1, §6): pantalla intermedia entre crear
// la cuenta y verificar el mail — con opción de reenvío (rate limit 1/60s,
// 5/hora/cuenta, aplicado del lado del backend; acá solo se refleja el
// mensaje que devuelva).
export function RevisaCorreo({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reenviar() {
    setPending(true);
    setError(null);
    setMensaje(null);
    const result = await reenviarVerificacionAction(email);
    setPending(false);
    if ("mensaje" in result) {
      setMensaje(result.mensaje);
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm text-grafito/70">
        Te mandamos un link de confirmación a <span className="font-medium text-grafito">{email}</span>. Abrilo para
        activar tu cuenta y seguir con el alta.
      </p>

      {mensaje ? (
        <p className={authSuccessClass}>{mensaje}</p>
      ) : (
        <button type="button" onClick={reenviar} disabled={pending} className={authSubmitClass}>
          {pending ? "Reenviando…" : "Reenviar mail de confirmación"}
        </button>
      )}
      {error && (
        <p role="alert" className={authErrorClass}>
          {error}
        </p>
      )}
    </div>
  );
}
