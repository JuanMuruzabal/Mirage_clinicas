"use client";

import { useState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await loginAction({ email, password });
    // Si loginAction tuvo éxito, ya redirigió (lanza internamente) y esta
    // línea no se alcanza a ejecutar.
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-grafito">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-grafito outline-none focus:border-salvia"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-grafito">Contraseña</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-field border-[0.5px] border-arena bg-marfil px-3 py-2 text-grafito outline-none focus:border-salvia"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-terracota-oscuro">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-salvia-oscuro px-4 py-3 text-sm font-semibold text-marfil hover:brightness-95 disabled:opacity-60"
      >
        {pending ? "Ingresando…" : "Ingresar"}
      </button>

      <p className="text-center text-sm text-grafito/60">
        ¿Todavía no tenés cuenta?{" "}
        <Link href="/sumarse" className="font-medium text-salvia-oscuro hover:text-grafito">
          Sumate
        </Link>
      </p>
    </form>
  );
}
