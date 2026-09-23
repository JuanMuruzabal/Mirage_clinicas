"use client";

import { useState } from "react";
import type { ClinicaConsentimientoPagina } from "@dental-mirage/shared-types";
import { actualizarAvalPaginaPublicaAction } from "@/app/actions/consentimiento-pagina";

export function AvalPaginaPublica({ clinicas }: { clinicas: ClinicaConsentimientoPagina[] }) {
  const [estados, setEstados] = useState(clinicas);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);

  async function cambiar(clinicId: string, avalPaginaPublica: boolean) {
    const anterior = estados.find((c) => c.clinicId === clinicId)?.avalPaginaPublica ?? false;
    setError(null);
    setPendiente(clinicId);
    setEstados((actual) => actual.map((c) => c.clinicId === clinicId ? { ...c, avalPaginaPublica } : c));
    const resultado = await actualizarAvalPaginaPublicaAction({ clinicId, avalPaginaPublica });
    setPendiente(null);
    if ("error" in resultado) {
      setEstados((actual) => actual.map((c) => c.clinicId === clinicId ? { ...c, avalPaginaPublica: anterior } : c));
      setError(resultado.error ?? "No se pudo actualizar el consentimiento.");
    }
  }

  return (
    <section aria-labelledby="aval-pagina-titulo" className="w-full max-w-lg rounded-card border-[0.5px] border-arena bg-marfil p-5 shadow-soft">
      <h2 id="aval-pagina-titulo" className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Aparecer en la página pública</h2>
      <p className="mt-2 text-sm text-grafito/70">Elegís en qué clínicas pueden mostrar tu nombre, foto y descripción. Podés cambiarlo cuando quieras.</p>
      <ul className="mt-4 flex flex-col divide-y divide-arena">
        {estados.map((clinica) => (
          <li key={clinica.clinicId} className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-medium text-grafito">{clinica.nombre}</span>
            <label className="flex items-center gap-2 text-sm text-grafito">
              <input
                type="checkbox"
                checked={clinica.avalPaginaPublica}
                disabled={pendiente === clinica.clinicId}
                onChange={(event) => cambiar(clinica.clinicId, event.currentTarget.checked)}
              />
              <span>{clinica.avalPaginaPublica ? "Autorizado" : "No autorizado"}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm text-terracota-oscuro">{error}</p>}
      <p aria-live="polite" role="status" className="sr-only">{pendiente ? "Guardando consentimiento…" : ""}</p>
    </section>
  );
}
