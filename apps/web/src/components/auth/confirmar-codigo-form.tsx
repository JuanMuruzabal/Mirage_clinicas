"use client";

import { useState } from "react";
import { verificarEmailAction, reenviarVerificacionAction } from "@/app/actions/auth";
import {
  AuthField,
  CampoConIcono,
  authErrorClass,
  authInputConIconoClass,
  authSubmitClass,
  authSuccessClass,
} from "@/components/auth/auth-shell";
import { CasillasCodigo, LARGO_CODIGO } from "@/components/auth/casillas-codigo";
import { IconMail } from "@/components/icons";

interface ConfirmarCodigoFormProps {
  /** Mail al que se mandó (o se va a mandar) el código. */
  email: string;
  /** true (default) cuando el mail ya se conoce por contexto — RevisaCorreo
   * (sumarse) y el aviso de "mail no verificado" en el login ya saben a
   * qué cuenta se refieren, se muestra como texto fijo. En falso
   * (/verificar-mail, acceso directo sin sesión ni contexto previo) se
   * deja como un input editable — TR-055 en docs/Arquitectura y base/tradeoffs.md. */
  emailFijo?: boolean;
}

// ConfirmarCodigoForm — TR-055 en docs/Arquitectura y base/tradeoffs.md: reemplaza al link de
// un solo clic (ConfirmarMailButton) por un código de 6 dígitos que la
// persona escribe a mano, sin salir de la pantalla donde se registró. Un
// solo componente compartido por las tres pantallas donde hace falta
// confirmar una cuenta (RevisaCorreo en /sumarse, el aviso de "mail no
// verificado" en /ingresar, y /verificar-mail como acceso directo).
//
// Las casillas son las MISMAS que las del wizard público de sacar turno
// desde la ronda de QA del 2026-09-13 (ver CasillasCodigo): es la misma
// acción —copiar seis dígitos de un mail— y hasta acá se veía de dos
// formas distintas según por dónde hubiera entrado la persona. Acá el
// campo era uno solo con placeholder "000000", que se lee como contenido
// ya cargado y no muestra cuántos dígitos faltan.
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
            <CampoConIcono icono={<IconMail className="h-[18px] w-[18px]" />}>
              <input
                type="email"
                autoComplete="email"
                className={authInputConIconoClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </CampoConIcono>
          </AuthField>
        )}

        <CasillasCodigo error={error} onCambio={setCodigo} idPrefijo="codigo-cuenta" />

        {error && (
          <p role="alert" className={authErrorClass}>
            {error}
          </p>
        )}

        <button type="submit" disabled={pending || codigo.length !== LARGO_CODIGO} className={authSubmitClass}>
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
