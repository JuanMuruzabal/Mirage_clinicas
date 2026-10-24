import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { NuevaPasswordForm } from "./nueva-password-form";
import { FondoOndas } from "@/components/fondo-ondas";

export const metadata: Metadata = { title: "Nueva contraseña — PRISMA" };

interface NuevaPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function NuevaPasswordPage({ searchParams }: NuevaPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <>
      {/* FondoOndas (correcciones generales, ítem 1, 2026-10-10): el fondo
          de ondas de toda la app, en lugar de las crucecitas y del hueso
          plano. Va afuera de <main>, fijo y detrás del contenido. */}
      <FondoOndas />
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
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
    </>
  );
}
