"use client";

import { useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { loginAction } from "@/app/actions/auth";
import { loginSchema, type LoginFormValues } from "@/lib/validation/auth";
import { AuthDivider, AuthField, authErrorClass, authInputClass, authSubmitClass } from "@/components/auth/auth-shell";
import { ConfirmarCodigoForm } from "@/components/auth/confirmar-codigo-form";
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

  async function onSubmit(values: LoginFormValues) {
    setErrorGlobal(null);
    setMailNoVerificado(false);
    const result = await loginAction(values);
    // Si loginAction tuvo éxito, ya redirigió y esta línea no se alcanza.
    if (result && "mensaje" in result) {
      // Estado especial admitido por la spec (§7): credenciales correctas,
      // mail sin verificar todavía — TR-055 en docs/tradeoffs.md: se
      // muestra el mismo formulario de código que en /sumarse, en vez de
      // solo un botón de reenvío sin forma de terminar de confirmar acá.
      setMailNoVerificado(true);
      return;
    }
    if (result?.error) {
      setErrorGlobal(result.error);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
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
          <div className="flex flex-col gap-3 rounded-field border-[0.5px] border-terracota bg-terracota-claro px-4 py-4 text-sm text-terracota-oscuro">
            <p>Confirmá tu mail antes de iniciar sesión.</p>
            <ConfirmarCodigoForm email={getValues("email")} />
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

      {/* Google al pie, no arriba del form nativo — pedido explícito del
          cliente, 2026-08-28: "mirá cómo hicimos con Alojamientos Madryn,
          lo pusimos abajo del todo con un 'También ingresá con'" — mismo
          patrón que ese proyecto de referencia (login-form.tsx ahí), con
          el texto del divisor adaptado. */}
      <AuthDivider />
      <GoogleSignInButton onError={setErrorGlobal} />

      <p className="text-center text-sm text-grafito/60">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/sumarse" className="font-medium text-salvia-oscuro hover:text-grafito">
          Sumate
        </Link>
      </p>
    </div>
  );
}
