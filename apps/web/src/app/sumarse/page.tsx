import type { Metadata } from "next";
import { apiListEspecialidades } from "@/lib/api";
import { SumarseWizard } from "./sumarse-wizard";

export const metadata: Metadata = { title: "Sumate — Dental Mirage" };

// Flujo de alta (spec §3): datos personales → especialidades → nombre de
// clínica → selección de servicios. La opción "organización" se omite del
// todo (TR-009 en docs/tradeoffs.md) — el wizard arranca directo en
// "particular". El catálogo de especialidades (TR-004) se resuelve acá,
// en el Server Component, y se pasa ya cargado al wizard interactivo.
// Identidad cálida (TR-015 en docs/tradeoffs.md).
export default async function SumarsePage() {
  const especialidadesResult = await apiListEspecialidades();
  const especialidades = especialidadesResult.ok ? especialidadesResult.data : [];

  return (
    <main className="flex flex-1 flex-col items-center gap-8 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Sumate a Dental Mirage</h1>
      <SumarseWizard especialidades={especialidades} />
    </main>
  );
}
