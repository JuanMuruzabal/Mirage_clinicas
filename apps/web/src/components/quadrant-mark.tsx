// TR-104: `pendiente` se sacó del todo — solo quedan agendado/cancelada.
export type EstadoTurno = "agendado" | "cancelada";

interface QuadrantMarkProps {
  className?: string;
  // T3.3: variante que encodea el estado real de un turno en una tabla
  // (docs/tradeoffs.md TR-010) — 4 llenos = agendado, tachado diagonal =
  // cancelada. Sin `estado`, es la forma puramente decorativa/estructural
  // (reemplaza al border-radius en la esquina de un panel).
  estado?: EstadoTurno;
}

// Cuadrantes llenos por estado, en orden de lectura (arriba-izq → abajo-der)
// — no hay una convención de orden clínico ya establecida en el producto
// todavía (la lectura real de un odontograma queda para cuando se sume el
// indicador de carga que menciona TR-010).
const CUADRANTES_LLENOS: Record<EstadoTurno, number> = {
  agendado: 4,
  cancelada: 0,
};

// Marca de cuadrante — elemento firma del Sistema Cascarón (spec §9.7,
// docs/tradeoffs.md TR-010). Grilla 2×2 de borde duro que replica la
// estructura de un odontograma real.
export function QuadrantMark({ className = "", estado }: QuadrantMarkProps) {
  const llenos = estado ? CUADRANTES_LLENOS[estado] : 0;
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid h-[1em] w-[1em] grid-cols-2 grid-rows-2 gap-[0.12em] ${className}`}
    >
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={`block border-[1.4px] border-current ${i < llenos ? "bg-current" : ""}`} />
      ))}
      {estado === "cancelada" && (
        <i className="absolute inset-0 border-t-[1.4px] border-current" style={{ transform: "rotate(-27deg)" }} />
      )}
    </span>
  );
}
