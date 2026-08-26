import type { Metadata } from "next";
import { requireOnboardingComplete } from "@/lib/session";
import { apiListEspecialidades } from "@/lib/api";
import { LogoutButton } from "@/components/logout-button";
import { PerfilForm } from "./perfil-form";

export const metadata: Metadata = { title: "Tu perfil — Dental Mirage" };

// "Tu perfil" (T1.5, extendido por docs/feature-sumarte-login.md con
// matrícula/documento/años de experiencia/bio/idiomas): datos personales +
// especialidades editables. Email y nombre de clínica no se editan acá.
// "Cerrar sesión" vive acá, no en el header global (pedido explícito del
// cliente, 2026-08-23) — separado del formulario para que no se confunda
// con "Guardar cambios".
export default async function PerfilPage() {
  const sesion = await requireOnboardingComplete();
  const catalogoResult = await apiListEspecialidades();
  const catalogo = catalogoResult.ok ? catalogoResult.data : [];

  return (
    <main className="flex flex-1 flex-col items-center gap-8 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Tu perfil</h1>
      <PerfilForm sesion={sesion} catalogo={catalogo} />
      <div className="w-full max-w-lg border-t-[0.5px] border-arena pt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
