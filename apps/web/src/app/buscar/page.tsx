import type { Metadata } from "next";
import Link from "next/link";
import { apiBuscarClinicas, apiListEspecialidades } from "@/lib/api";
import { ClinicSearchForm } from "@/components/clinic-search-form";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = {
  title: "Buscar clínicas — Dental Mirage",
  description: "Encontrá tu clínica dental en Córdoba por nombre, profesional o especialidad.",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Buscador público de clínicas (spec §6, FR-10) — sin sesión, para
// pacientes. Adelantado desde Sprint 4 (T4.5), ver TR-012 en
// docs/tradeoffs.md: todavía no filtra por página "deployada", porque ese
// flujo (Sprint 4) no existe aún. Identidad cálida (TR-015).
export default async function BuscarPage({ searchParams }: PageProps<"/buscar">) {
  const resolvedParams = await searchParams;
  const q = firstParam(resolvedParams.q);
  const especialidad = firstParam(resolvedParams.especialidad);

  const [resultadosResult, especialidadesResult] = await Promise.all([
    apiBuscarClinicas({ q, especialidad }),
    apiListEspecialidades(),
  ]);
  const resultados = resultadosResult.ok ? resultadosResult.data : [];
  const especialidades = especialidadesResult.ok ? especialidadesResult.data : [];

  return (
    <main className="flex flex-1 flex-col gap-10 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <div className="mx-auto w-full max-w-3xl text-center">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">Buscar clínicas</h1>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <ClinicSearchForm especialidades={especialidades} defaultQ={q} defaultEspecialidad={especialidad} />
      </div>

      <div className="mx-auto w-full max-w-5xl">
        {resultados.length === 0 ? (
          <p className="text-center text-sm text-grafito/60">
            No encontramos clínicas para esa búsqueda. Probá con otro nombre o especialidad.
          </p>
        ) : (
          // Cuadraditos horizontales (pedido explícito del cliente,
          // 2026-08-23) — antes una lista vertical de tarjetas anchas, ahora
          // una grilla que crece en columnas según el ancho disponible.
          // `aspect-square` + contenido acotado para que cada tarjeta se
          // vea pareja sin importar cuánto texto tenga cada clínica.
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {resultados.map((clinica, i) => (
              <ScrollReveal key={clinica.slug} delay={Math.min(i * 0.05, 0.3)}>
                <li className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-card border-[0.5px] border-arena bg-marfil p-4 text-center shadow-soft transition-colors duration-300 hover:border-salvia hover:bg-hueso">
                  <p className="font-[family-name:var(--font-display)] text-base font-medium text-grafito">{clinica.nombreClinica}</p>
                  <p className="text-xs text-grafito/60">{clinica.profesionalNombre}</p>
                  <Link
                    href={`/${clinica.slug}`}
                    className="mt-2 text-xs font-medium text-salvia-oscuro hover:text-grafito"
                  >
                    Ver clínica →
                  </Link>
                </li>
              </ScrollReveal>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
