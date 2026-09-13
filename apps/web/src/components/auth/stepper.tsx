// Indicador de progreso genérico, reusado por dos flujos separados desde
// la reestructuración del 2026-08-26 (pedido explícito del cliente: crear
// cuenta + verificar código quedan en /sumarse; perfil + clínica pasan a
// vivir en el modal de bienvenida sobre /seleccionar-servicio, ver
// docs/Arquitectura y base/tradeoffs.md TR-057) — antes era un solo wizard de 3 pasos fijos.
export interface PasoStepper {
  id: string;
  titulo: string;
}

export const PASOS_SUMARSE: readonly PasoStepper[] = [
  { id: "cuenta", titulo: "Crear cuenta" },
  { id: "verificar", titulo: "Confirmar cuenta" },
] as const;

// PASOS_BIENVENIDA (perfil + clínica) se fue en la Fase 3.2.3: el modal
// de bienvenida quedó en un solo paso —el perfil— porque crear la clínica
// dejó de ser obligatorio para entrar a la app. Un stepper de un paso no
// informa nada.

export function Stepper({ pasos, actual }: { pasos: readonly PasoStepper[]; actual: string }) {
  const indexActual = pasos.findIndex((p) => p.id === actual);

  // Rediseño de la ronda de QA del 2026-09-13 (ver la bitácora de la fase (`docs/Fases post MVP/Fase 3/fase3.2-multi-tenant.md`)): círculos unidos por una línea, con la etiqueta
  // DEBAJO y el paso activo relleno con el verde de la marca.
  //
  // Lo que había antes era una fila de texto en mayúsculas con
  // letter-spacing ancho y un guión suelto entre paso y paso, y el
  // cliente lo marcó como ilegible. No era una impresión: en un stepper,
  // lo que tiene que leerse de un vistazo es CUÁNTOS pasos hay y en cuál
  // estoy — dos cosas que se ven en la forma, no en el texto. Poniendo la
  // etiqueta abajo, la fila de arriba queda como lo que es: un mapa.
  return (
    <ol className="flex items-start">
      {pasos.map((p, i) => {
        const completado = i < indexActual;
        const esActual = i === indexActual;
        const alcanzado = completado || esActual;
        // Corrección de QA (2026-09-13): antes el primer paso NO
        // era `flex-1` y los demás sí, así que las columnas medían
        // distinto y el grupo entero quedaba corrido a la izquierda. Con
        // todas iguales y una línea a CADA lado del círculo —invisible en
        // los extremos, para que el último no arrastre una hacia la
        // nada—, cada círculo queda centrado en su columna y el conjunto
        // centrado en la tarjeta.
        return (
          <li key={p.id} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              <span
                aria-hidden="true"
                className={`h-px flex-1 ${i === 0 ? "invisible" : alcanzado ? "bg-salvia" : "bg-arena"}`}
              />
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  alcanzado
                    ? "bg-salvia-oscuro text-marfil"
                    : "border-[0.5px] border-arena bg-marfil text-grafito/40"
                }`}
              >
                {completado ? "✓" : i + 1}
              </span>
              <span
                aria-hidden="true"
                className={`h-px flex-1 ${
                  i === pasos.length - 1 ? "invisible" : i < indexActual ? "bg-salvia" : "bg-arena"
                }`}
              />
            </div>
            <span className={`text-center text-xs ${esActual ? "font-medium text-grafito" : "text-grafito/50"}`}>
              {p.titulo}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
