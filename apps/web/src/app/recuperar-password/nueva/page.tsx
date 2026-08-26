import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { NuevaPasswordForm } from "./nueva-password-form";

export const metadata: Metadata = { title: "Nueva contraseña — Dental Mirage" };

interface NuevaPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function NuevaPasswordPage({ searchParams }: NuevaPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-hueso px-6 py-16">
      <AuthShell title="Elegí tu nueva contraseña" volverHref="/ingresar" volverLabel="Volver a ingresar">
        {token ? (
          <NuevaPasswordForm token={token} />
        ) : (
          <p className="text-center text-sm text-terracota-oscuro" role="alert">
            Este link no es válido — pedí uno nuevo desde{" "}
            <Link href="/recuperar-password" className="font-medium underline">
              recuperar contraseña
            </Link>
            .
          </p>
        )}
      </AuthShell>
    </main>
  );
}
