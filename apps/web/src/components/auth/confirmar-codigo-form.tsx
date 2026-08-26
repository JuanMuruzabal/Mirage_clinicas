"use client";

import { useState } from "react";
import { verificarEmailAction, reenviarVerificacionAction } from "@/app/actions/auth";
import {
  AuthField,
  authErrorClass,
  authInputClass,
  authSubmitClass,
  authSuccessClass,
} from "@/components/auth/auth-shell";

interface ConfirmarCodigoFormProps {
  /** Mail al que se mandó (o se va a mandar) el código. */
  email: string;
  /** true (default) cuando el mail ya se conoce por contexto — RevisaCorreo
   * (sumarse) y el aviso de "mail no verificado" en el login ya saben a
   * qué cuenta se refieren, se muestra como texto fijo. En falso
   * (/verificar-mail, acceso directo sin sesión ni contexto previo) se
   * deja como un input editable — TR-055 en docs/tradeoffs.md. */
  emailFijo?: boolean;
}

// ConfirmarCodigoForm — TR-055 en docs/tradeoffs.md: reemplaza al link de
// un solo clic (ConfirmarMailButton) por un código de 6 dígitos que la
// persona escribe a mano, sin salir de la pantalla donde se registró. Un
// solo componente compartido por las tres pantallas donde hace falta
// confirmar una cuenta (RevisaCorreo en /sumarse, el aviso de "mail no
// verificado" en /ingresar, y /verificar-mail como acceso directo).
export function ConfirmarCodigoForm({ email: emailInicial, emailFijo = true }: ConfirmarCodigoFormProps) {
  const [email, setEmail] = useState(emailInicial);
  const [codigo, setCodigo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState<string | null>(null);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await verificarEmailAction({ email, codigo });
    // Si tuvo éxito, la acción ya redirigió a /sumarse y esta línea no se
    // alcanza.
    setPending(false);
    if (result?.error) {
      setError(result.error);
    }
  }

  async function reenviar() {
    setReenviando(true);
    setError(null);
    const result = await reenviarVerificacionAction(email);
    setReenviando(false);
    if ("mensaje" in result) {
      setReenviado(result.mensaje);
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={confirmar} noValidate className="flex flex-col gap-4">
        {emailFijo ? (
          <p className="text-center text-sm text-grafito/70">
            Te mandamos un código a <span className="font-medium text-grafito">{email}</span>. Ingresalo acá abajo
            para activar tu cuenta.
          </p>
        ) : (
          <AuthField label="Email">
            <input
              type="email"
              autoComplete="email"
              className={authInputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </AuthField>
        )}

        <AuthField label="Código de confirmación">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className={`${authInputClass} text-center text-lg tracking-[0.3em]`}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
        </AuthField>

        {error && (
          <p role="alert" className={authErrorClass}>
            {error}
          </p>
        )}

        <button type="submit" disabled={pending || codigo.length !== 6} className={authSubmitClass}>
          {pending ? "Confirmando…" : "Confirmar mi cuenta"}
        </button>
      </form>

      <div className="text-center text-sm text-grafito/60">
        ¿No te llegó nada?{" "}
        {reenviado ? (
          <span className={authSuccessClass}>{reenviado}</span>
        ) : (
          <button
            type="button"
            onClick={reenviar}
            disabled={reenviando}
            className="font-medium text-salvia-oscuro hover:text-grafito disabled:opacity-60"
          >
            {reenviando ? "Reenviando…" : "Reenviar código"}
          </button>
        )}
      </div>
    </div>
  );
}
