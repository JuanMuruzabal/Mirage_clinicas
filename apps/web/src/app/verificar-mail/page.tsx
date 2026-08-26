import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ConfirmarMailButton } from "./confirmar-mail-button";

export const metadata: Metadata = { title: "Confirmá tu cuenta — Dental Mirage" };

interface VerificarMailPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerificarMailPage({ searchParams }: VerificarMailPageProps) {
  const { token } = await searchParams;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <AuthShell
        title="Confirmá tu cuenta"
        subtitle={token ? "Un último paso antes de seguir con tu alta." : undefined}
      >
        {token ? (
          <ConfirmarMailButton token={token} />
        ) : (
          <p className="text-center text-sm text-terracota-oscuro" role="alert">
            Este link no es válido — revisá que lo hayas copiado completo desde el mail.
          </p>
        )}
      </AuthShell>
    </main>
  );
}
