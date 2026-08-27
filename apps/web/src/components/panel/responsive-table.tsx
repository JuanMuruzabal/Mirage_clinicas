import type { ReactNode } from "react";

interface ResponsiveTableProps<T> {
  items: T[];
  getKey: (item: T) => string;
  /** La tabla de escritorio EXACTA de siempre — se pasa entera (con su
   * propio wrapper `rounded-card`/`max-h`/scroll), sin tocar nada de su
   * JSX ni sus clases. Solo se envuelve en `hidden md:block`, así que
   * desde `md` para arriba no cambia un solo píxel (pedido explícito del
   * cliente, 2026-08-26). */
  table: ReactNode;
  /** Una card por registro, mobile-first — reemplaza a la tabla por
   * completo debajo de `md`. */
  renderCard: (item: T) => ReactNode;
  /** Estado vacío — el mismo mensaje en ambos layouts, no hace falta
   * duplicarlo por breakpoint. */
  empty?: ReactNode;
}

// ResponsiveTable — TR-064 en docs/tradeoffs.md (pedido explícito del
// cliente, 2026-08-26, "Fix de bugs visuales responsive en la app de
// clínica dental"): reemplaza el patrón anterior (tabla con min-width
// fijo + scroll horizontal que arrastraba toda la página) por una lista
// de cards debajo de `md` (768px) — la tabla de escritorio queda
// exactamente igual arriba de ese breakpoint. Un solo componente para
// Turnos/Pacientes/ficha del paciente en vez de duplicar el interruptor
// `hidden md:block` / `md:hidden` en cada uno.
export function ResponsiveTable<T>({ items, getKey, table, renderCard, empty }: ResponsiveTableProps<T>) {
  if (items.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <div key={getKey(item)}>{renderCard(item)}</div>
        ))}
      </div>
    </>
  );
}
