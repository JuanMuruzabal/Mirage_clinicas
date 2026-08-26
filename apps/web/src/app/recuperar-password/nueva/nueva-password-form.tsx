"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { resetPasswordAction } from "@/app/actions/auth";
import { resetPasswordSchema, type ResetPasswordFormValues } from "@/lib/validation/auth";
import { AuthField, authErrorClass, authInputClass, authSubmitClass } from "@/components/auth/auth-shell";

export function NuevaPasswordForm({ token }: { token: string }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  async function onSubmit(values: ResetPasswordFormValues) {
    setErrorGlobal(null);
    const result = await resetPasswordAction(values);
    // Si tuvo éxito, la acción ya redirigió a /sumarse y esta línea no se
    // alcanza.
    if (result?.error) {
      setErrorGlobal(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <input type="hidden" {...register("token")} />

      <AuthField label="Nueva contraseña" error={errors.newPassword?.message} hint="Mínimo 12 caracteres.">
        <input type="password" autoComplete="new-password" className={authInputClass} {...register("newPassword")} />
      </AuthField>

      <AuthField label="Confirmar contraseña" error={errors.confirmarPassword?.message}>
        <input
          type="password"
          autoComplete="new-password"
          className={authInputClass}
          {...register("confirmarPassword")}
        />
      </AuthField>

      {errorGlobal && (
        <p role="alert" className={authErrorClass}>
          {errorGlobal}
        </p>
      )}

      <button type="submit" disabled={isSubmitting} className={authSubmitClass}>
        {isSubmitting ? "Guardando…" : "Guardar nueva contraseña"}
      </button>

      <p className="text-center text-sm text-grafito/60">
        <Link href="/ingresar" className="font-medium text-salvia-oscuro hover:text-grafito">
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}
