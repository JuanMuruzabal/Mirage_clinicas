import type { Metadata } from "next";
import { getMe, redirectSiEmailVerificado } from "@/lib/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";
import { FondoOndas } from "@/components/fondo-ondas";

export const metadata: Metadata = { title: "Ingresar — PRISMA" };

// Identidad cálida (TR-015 en docs/Arquitectura y base/tradeoffs.md). Con sesión y mail ya
// verificado, no tiene sentido mostrar el form de login — se manda
// directo a /seleccionar-servicio (TR-057 en docs/Arquitectura y base/tradeoffs.md: ya no
// hace falta esperar a que el onboarding esté completo del todo).
export default async function IngresarPage() {
  const me = await getMe();
  await redirectSiEmailVerificado(me);

  return (
    <>
      {/* FondoOndas (correcciones generales, ítem 1, 2026-10-10): el fondo
          de ondas de toda la app, en lugar de las crucecitas y del hueso
          plano. Va afuera de <main>, fijo y detrás del contenido. */}
      <FondoOndas />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
        <AuthShell title="Ingresar">
          <LoginForm />
        </AuthShell>
      </main>
    </>
  );
}
