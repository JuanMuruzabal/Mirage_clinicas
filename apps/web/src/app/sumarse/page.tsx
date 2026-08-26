import type { Metadata } from "next";
import { apiListEspecialidades } from "@/lib/api";
import { getMe, redirectSiOnboardingCompleto } from "@/lib/session";
import { SumarseWizard } from "./sumarse-wizard";

export const metadata: Metadata = { title: "Sumate — Dental Mirage" };

// Flujo de alta en 3 pasos (spec §4, docs/feature-sumarte-login.md):
// Crear cuenta → Perfil profesional → Tu clínica. El catálogo de
// especialidades (TR-004 en docs/tradeoffs.md) se resuelve acá, en el
// Server Component, y se pasa ya cargado al wizard interactivo — mismo
// patrón que antes de esta feature. Con onboarding ya completo, no se
// puede reentrar al wizard (spec §4) — se manda a /seleccionar-servicio.
// Identidad cálida (TR-015 en docs/tradeoffs.md).
export default async function SumarsePage() {
  const [especialidadesResult, me] = await Promise.all([apiListEspecialidades(), getMe()]);
  const especialidades = especialidadesResult.ok ? especialidadesResult.data : [];

  await redirectSiOnboardingCompleto(me);

  return (
    <main className="flex flex-1 flex-col items-center gap-8 bg-hueso px-6 py-16">
      <SumarseWizard me={me} especialidades={especialidades} />
    </main>
  );
}
