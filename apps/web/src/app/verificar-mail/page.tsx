import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmarCodigoForm } from "@/components/auth/confirmar-codigo-form";

export const metadata: Metadata = { title: "Confirmá tu cuenta — Dental Mirage" };

interface VerificarMailPageProps {
  searchParams: Promise<{ email?: string }>;
}

// Acceso directo/de respaldo (TR-055 en docs/tradeoffs.md): el camino
// normal es confirmar sin salir de /sumarse o /ingresar, que ya conocen el
// mail por contexto — esta pantalla es para el caso de alguien que abre el
// código en otro dispositivo, sin sesión ni formulario a mano, así que el
// mail queda editable en vez de fijo (`emailFijo={false}`), con lo que
// venga en `?email=` como punto de partida si está.
export default async function VerificarMailPage({ searchParams }: VerificarMailPageProps) {
  const { email } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-hueso px-6 py-16">
      <AuthShell title="Confirmá tu cuenta" subtitle="Ingresá el código de 6 dígitos que te mandamos por mail.">
        <ConfirmarCodigoForm email={email ?? ""} emailFijo={false} />
      </AuthShell>
    </main>
  );
}
