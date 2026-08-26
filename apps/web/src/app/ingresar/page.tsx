import type { Metadata } from "next";
import { getMe, redirectSiEmailVerificado } from "@/lib/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar — Dental Mirage" };

// Identidad cálida (TR-015 en docs/tradeoffs.md). Con sesión y mail ya
// verificado, no tiene sentido mostrar el form de login — se manda
// directo a /seleccionar-servicio (TR-057 en docs/tradeoffs.md: ya no
// hace falta esperar a que el onboarding esté completo del todo).
export default async function IngresarPage() {
  const me = await getMe();
  await redirectSiEmailVerificado(me);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-hueso px-6 py-16">
      <AuthShell title="Ingresar">
        <LoginForm />
      </AuthShell>
    </main>
  );
}
