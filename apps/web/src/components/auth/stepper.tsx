// Indicador de progreso del wizard de 3 pasos (spec §4): "stepper visible
// y persistente en los tres pasos, con estados completado/actual/
// pendiente". Reemplaza al que vivía inline en sumarse-wizard.tsx —
// ahora se alimenta de `onboardingStep` real (backend), no de un estado
// local del wizard.
const PASOS = [
  { id: "cuenta", titulo: "Crear cuenta" },
  { id: "perfil", titulo: "Perfil profesional" },
  { id: "clinica", titulo: "Tu clínica" },
] as const;

export type PasoWizard = (typeof PASOS)[number]["id"];

export function Stepper({ actual }: { actual: PasoWizard }) {
  const indexActual = PASOS.findIndex((p) => p.id === actual);

  return (
    <ol className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
      {PASOS.map((p, i) => {
        const completado = i < indexActual;
        const esActual = i === indexActual;
        return (
          <li key={p.id} className={`flex items-center gap-2 ${esActual ? "text-grafito" : ""}`}>
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded-full border-[0.5px] ${
                completado
                  ? "border-salvia bg-salvia-claro text-salvia-oscuro"
                  : esActual
                    ? "border-salvia text-salvia-oscuro"
                    : "border-arena"
              }`}
            >
              {completado ? "✓" : i + 1}
            </span>
            {p.titulo}
            {i < PASOS.length - 1 && <span className="mx-1 text-arena">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
