import type { Metadata } from "next";
import { getMe, redirectSiOnboardingCompleto } from "@/lib/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar — Dental Mirage" };

// Identidad cálida (TR-015 en docs/tradeoffs.md). Con sesión y onboarding
// ya completo, no tiene sentido mostrar el form de login — se manda
// directo a /seleccionar-servicio.
export default async function IngresarPage() {
  const me = await getMe();
  await redirectSiOnboardingCompleto(me);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-hueso px-6 py-16">
      <AuthShell title="Ingresar">
        <LoginForm />
      </AuthShell>
    </main>
  );
}
