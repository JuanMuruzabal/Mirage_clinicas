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
    // panel-texture (TR-073 en docs/tradeoffs.md, 2026-08-27, pedido
    // explícito del cliente): mismo fondo texturizado que /panel — antes
    // reservado solo a gestión de clínica (TR-013), ahora también en
    // ingresar/sumarse.
    <main className="panel-texture flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <AuthShell title="Ingresar">
        <LoginForm />
      </AuthShell>
    </main>
  );
}
