import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RecuperarPasswordForm } from "./recuperar-password-form";
import { FondoOndas } from "@/components/fondo-ondas";

export const metadata: Metadata = { title: "Recuperar contraseña — PRISMA" };

// Identidad cálida (TR-015 en docs/Arquitectura y base/tradeoffs.md). Sin guard de sesión — es
// una pantalla pública, para alguien que probablemente no puede loguearse.
export default function RecuperarPasswordPage() {
  return (
    <>
      {/* FondoOndas (correcciones generales, ítem 1, 2026-10-10): el fondo
          de ondas de toda la app, en lugar de las crucecitas y del hueso
          plano. Va afuera de <main>, fijo y detrás del contenido. */}
      <FondoOndas />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
        <AuthShell
          title="Recuperar contraseña"
          subtitle="Te mandamos instrucciones a tu mail para elegir una nueva."
          volverHref="/ingresar"
          volverLabel="Volver a ingresar"
        >
          <RecuperarPasswordForm />
        </AuthShell>
      </main>
    </>
  );
}
