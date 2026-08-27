import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecuperarPasswordForm } from "./recuperar-password-form";

export const metadata: Metadata = { title: "Recuperar contraseña — Dental Mirage" };

// Identidad cálida (TR-015 en docs/tradeoffs.md). Sin guard de sesión — es
// una pantalla pública, para alguien que probablemente no puede loguearse.
export default function RecuperarPasswordPage() {
  return (
    // panel-texture (TR-076 en docs/tradeoffs.md, 2026-08-27, pedido
    // explícito del cliente: "recuperar contraseña... no posee el fondo
    // texturizado del login y el sumarte") — mismo criterio que TR-073
    // en /ingresar y /sumarse, se había quedado afuera de ese cambio.
    <main className="panel-texture flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <AuthShell
        title="Recuperar contraseña"
        subtitle="Te mandamos instrucciones a tu mail para elegir una nueva."
        volverHref="/ingresar"
        volverLabel="Volver a ingresar"
      >
        <RecuperarPasswordForm />
      </AuthShell>
    </main>
  );
}
