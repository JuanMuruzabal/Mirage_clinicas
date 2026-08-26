import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecuperarPasswordForm } from "./recuperar-password-form";

export const metadata: Metadata = { title: "Recuperar contraseña — Dental Mirage" };

// Identidad cálida (TR-015 en docs/tradeoffs.md). Sin guard de sesión — es
// una pantalla pública, para alguien que probablemente no puede loguearse.
export default function RecuperarPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <AuthShell title="Recuperar contraseña" subtitle="Te mandamos instrucciones a tu mail para elegir una nueva.">
        <RecuperarPasswordForm />
      </AuthShell>
    </main>
  );
}
