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

  async function onSubmit(values: CrearCuentaFormValues) {
    setErrorGlobal(null);
    const result = await registerAction({
      email: values.email,
      password: values.password,
      aceptaTerminos: values.aceptaTerminos,
      captchaToken: values.captchaToken,
    });
    if ("mensaje" in result) {
      onRegistrado(values.email);
      return;
    }
    setErrorGlobal(result.error);
  }

  return (
    <div className="flex flex-col gap-5">
      <GoogleSignInButton onError={setErrorGlobal} />
      <AuthDivider />

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

      <p className="text-center text-sm text-grafito/60">
        ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-medium text-salvia-oscuro hover:text-grafito">
          Ingresar
        </Link>
      </p>
    </div>
  );
}
