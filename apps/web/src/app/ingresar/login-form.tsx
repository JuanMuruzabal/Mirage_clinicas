"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { loginAction, reenviarVerificacionAction } from "@/app/actions/auth";
import { loginSchema, type LoginFormValues } from "@/lib/validation/auth";
import {
  AuthDivider,
  AuthField,
  authErrorClass,
  authInputClass,
  authSubmitClass,
  authSuccessClass,
} from "@/components/auth/auth-shell";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";

export function LoginForm() {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [mailNoVerificado, setMailNoVerificado] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [reenviado, setReenviado] = useState<string | null>(null);

  async function onSubmit(values: LoginFormValues) {
    setErrorGlobal(null);
    setMailNoVerificado(false);
    setReenviado(null);
    const result = await loginAction(values);
    // Si loginAction tuvo éxito, ya redirigió y esta línea no se alcanza.
    if (result && "mensaje" in result) {
      // Estado especial admitido por la spec (§7): credenciales correctas,
      // mail sin verificar todavía — acción de reenvío en vez de error.
      setMailNoVerificado(true);
      return;
    }
    if (result?.error) {
      setErrorGlobal(result.error);
    }
  }

  async function reenviar() {
    setReenviando(true);
    const email = getValues("email");
    const result = await reenviarVerificacionAction(email);
    setReenviando(false);
    if ("mensaje" in result) {
      setReenviado(result.mensaje);
    } else {
      setErrorGlobal(result.error);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <GoogleSignInButton onError={setErrorGlobal} />
      <AuthDivider />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <AuthField label="Email" error={errors.email?.message}>
          <input
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            className={authInputClass}
            {...register("email")}
          />
        </AuthField>

        <AuthField label="Contraseña" error={errors.password?.message}>
          <input
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            className={authInputClass}
            {...register("password")}
          />
        </AuthField>

        <div className="flex justify-end">
          <Link href="/recuperar-password" className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {mailNoVerificado && (
          <div className="flex flex-col gap-2 rounded-field border-[0.5px] border-terracota bg-terracota-claro px-4 py-3 text-sm text-terracota-oscuro">
            <p>Confirmá tu mail antes de iniciar sesión.</p>
            {reenviado ? (
              <p className={authSuccessClass}>{reenviado}</p>
            ) : (
              <button
                type="button"
                onClick={reenviar}
                disabled={reenviando}
                className="self-start font-medium underline hover:no-underline disabled:opacity-60"
              >
                {reenviando ? "Reenviando…" : "Reenviar mail de confirmación"}
              </button>
            )}
          </div>
        )}
        {errorGlobal && (
          <p role="alert" className={authErrorClass}>
            {errorGlobal}
          </p>
        )}

        <button type="submit" disabled={isSubmitting} className={authSubmitClass}>
          {isSubmitting ? "Ingresando…" : "Ingresar"}
        </button>
      </form>

      <p className="text-center text-sm text-grafito/60">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/sumarse" className="font-medium text-salvia-oscuro hover:text-grafito">
          Sumate
        </Link>
      </p>
    </div>
  );
}
