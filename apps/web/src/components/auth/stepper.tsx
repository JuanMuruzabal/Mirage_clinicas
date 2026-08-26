// Indicador de progreso genérico, reusado por dos flujos separados desde
// la reestructuración del 2026-08-26 (pedido explícito del cliente: crear
// cuenta + verificar código quedan en /sumarse; perfil + clínica pasan a
// vivir en el modal de bienvenida sobre /seleccionar-servicio, ver
// docs/tradeoffs.md TR-057) — antes era un solo wizard de 3 pasos fijos.
export interface PasoStepper {
  id: string;
  titulo: string;
}

export const PASOS_SUMARSE: readonly PasoStepper[] = [
  { id: "cuenta", titulo: "Crear cuenta" },
  { id: "verificar", titulo: "Confirmar cuenta" },
] as const;

export const PASOS_BIENVENIDA: readonly PasoStepper[] = [
  { id: "perfil", titulo: "Tu perfil" },
  { id: "clinica", titulo: "Tu clínica" },
] as const;

export function Stepper({ pasos, actual }: { pasos: readonly PasoStepper[]; actual: string }) {
  const indexActual = pasos.findIndex((p) => p.id === actual);

  return (
    <ol className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
      {pasos.map((p, i) => {
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
            {i < pasos.length - 1 && <span className="mx-1 text-arena">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
