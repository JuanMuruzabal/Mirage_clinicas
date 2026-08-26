"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { recuperarPasswordAction } from "@/app/actions/auth";
import { recuperarPasswordSchema, type RecuperarPasswordFormValues } from "@/lib/validation/auth";
import { AuthField, authErrorClass, authInputClass, authSubmitClass, authSuccessClass } from "@/components/auth/auth-shell";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

export function RecuperarPasswordForm() {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RecuperarPasswordFormValues>({ resolver: zodResolver(recuperarPasswordSchema) });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  async function onSubmit(values: RecuperarPasswordFormValues) {
    setErrorGlobal(null);
    const result = await recuperarPasswordAction(values);
    if ("mensaje" in result) {
      setMensaje(result.mensaje);
    } else {
      setErrorGlobal(result.error);
    }
  }

  if (mensaje) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className={authSuccessClass}>{mensaje}</p>
        <Link href="/ingresar" className="text-sm font-medium text-salvia-oscuro hover:text-grafito">
          Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <AuthField label="Email" error={errors.email?.message}>
        <input type="email" autoComplete="email" className={authInputClass} {...register("email")} />
      </AuthField>

      <TurnstileWidget onToken={(token) => setValue("captchaToken", token)} />

      {errorGlobal && (
        <p role="alert" className={authErrorClass}>
          {errorGlobal}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={authSubmitClass}>
        {isSubmitting ? "Enviando…" : "Enviar instrucciones"}
      </button>

      <p className="text-center text-sm text-grafito/60">
        <Link href="/ingresar" className="font-medium text-salvia-oscuro hover:text-grafito">
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}
