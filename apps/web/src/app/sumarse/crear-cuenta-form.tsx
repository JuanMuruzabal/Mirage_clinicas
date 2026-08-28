"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { registerAction } from "@/app/actions/auth";
import { registerFormSchema, type CrearCuentaFormValues } from "@/lib/validation/auth";
import {
  AuthCheckboxField,
  AuthDivider,
  AuthField,
  authErrorClass,
  authInputClass,
  authSubmitClass,
} from "@/components/auth/auth-shell";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

// Paso 1 — Crear cuenta (spec §4): Google o email + contraseña. Con
// Google, el mail se considera verificado y se pasa directo al Paso 2 —
// el propio backend decide eso (googleLoginAction), este form solo cubre
// el camino nativo.
export function CrearCuentaForm({ onRegistrado }: { onRegistrado: (email: string) => void }) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CrearCuentaFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { aceptaTerminos: false, captchaToken: "" },
  });
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  // TR-062 en docs/tradeoffs.md: pedido explícito del cliente — si el
  // mail ya tiene una cuenta verificada, se lo decimos derecho en vez de
  // mandarlo al paso de código (que generaba confusión real, "no es el
  // estándar").
  const [cuentaExistente, setCuentaExistente] = useState(false);

  async function onSubmit(values: CrearCuentaFormValues) {
    setErrorGlobal(null);
    setCuentaExistente(false);
    const result = await registerAction({
      email: values.email,
      password: values.password,
      aceptaTerminos: values.aceptaTerminos,
      captchaToken: values.captchaToken,
    });
    // Si la cuenta ya quedó verificada (TR-051), registerAction ya
    // redirigió a /sumarse y esta línea no se alcanza.
    if (result && "cuentaExistente" in result) {
      setCuentaExistente(true);
      return;
    }
    if (result && "mensaje" in result) {
      onRegistrado(values.email);
      return;
    }
    if (result?.error) {
      setErrorGlobal(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {cuentaExistente && (
        <p className="rounded-field border-[0.5px] border-salvia bg-salvia-claro px-4 py-3 text-sm text-salvia-oscuro">
          Ese mail ya tiene una cuenta.{" "}
          <Link href="/ingresar" className="font-medium underline hover:no-underline">
            Iniciá sesión
          </Link>{" "}
          o{" "}
          <Link href="/recuperar-password" className="font-medium underline hover:no-underline">
            recuperá tu contraseña
          </Link>{" "}
          si la olvidaste.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        <AuthField label="Email" error={errors.email?.message}>
          <input type="email" autoComplete="email" className={authInputClass} {...register("email")} />
        </AuthField>

        <AuthField label="Contraseña" error={errors.password?.message} hint="Mínimo 12 caracteres.">
          <input type="password" autoComplete="new-password" className={authInputClass} {...register("password")} />
        </AuthField>

        <AuthField label="Confirmar contraseña" error={errors.confirmarPassword?.message}>
          <input
            type="password"
            autoComplete="new-password"
            className={authInputClass}
            {...register("confirmarPassword")}
          />
        </AuthField>

        <TurnstileWidget onToken={(token) => setValue("captchaToken", token)} />

        <AuthCheckboxField error={errors.aceptaTerminos?.message} {...register("aceptaTerminos")}>
          Acepto los{" "}
          <Link href="/terminos" className="font-medium text-salvia-oscuro hover:text-grafito">
            términos
          </Link>{" "}
          y la{" "}
          <Link href="/privacidad" className="font-medium text-salvia-oscuro hover:text-grafito">
            política de privacidad
          </Link>
          .
        </AuthCheckboxField>

        {errorGlobal && (
          <p role="alert" className={authErrorClass}>
            {errorGlobal}
          </p>
        )}

        <button type="submit" disabled={isSubmitting} className={authSubmitClass}>
          {isSubmitting ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>

      {/* Google al pie, no arriba del form nativo — pedido explícito del
          cliente, 2026-08-28: "mirá cómo hicimos con Alojamientos Madryn,
          lo pusimos abajo del todo con un 'También ingresá con'" — mismo
          patrón que ese proyecto de referencia (login-form.tsx/
          register-form.tsx ahí), con el texto del divisor adaptado. */}
      <AuthDivider />
      <GoogleSignInButton onError={setErrorGlobal} />

      <p className="text-center text-sm text-grafito/60">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-medium text-salvia-oscuro hover:text-grafito">
          Ingresar
        </Link>
      </p>
    </div>
  );
}
