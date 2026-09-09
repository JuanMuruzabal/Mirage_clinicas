"use client";

interface CargarMasProps {
  // cargados / total — cuántas filas hay en pantalla y cuántas hay
  // detrás de los filtros vigentes.
  cargados: number;
  total: number;
  cargando: boolean;
  onCargarMas: () => void;
  // sustantivo — "turnos" / "pacientes", para el contador.
  sustantivo: string;
}

// CargarMas — pie de los listados paginados del panel (Fase B de la
// auditoría). Paginación por "Cargar más" y no por páginas numeradas: el
// profesional recorre estas tablas escaneando de arriba a abajo, y
// partirlas en 1/2/3 lo obliga a recordar en qué página estaba cada vez
// que vuelve de abrir una ficha. Con "Cargar más" la lista solo crece,
// que es exactamente cómo se leía antes de paginar — la diferencia es que
// ahora la primera carga trae una tanda, no la tabla entera.
//
// No renderiza NADA cuando ya está todo cargado: en ese caso la tabla se
// comporta igual que siempre y el total ya lo dice el encabezado de la
// pantalla ("Turnos 14 en total"). El pie existe solo para explicar una
// lista cortada — por eso el contador vive acá adentro y desaparece con
// el botón.
export function CargarMas({ cargados, total, cargando, onCargarMas, sustantivo }: CargarMasProps) {
  const quedan = total - cargados;
  if (quedan <= 0) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onCargarMas}
        disabled={cargando}
        className="rounded-full border-[0.5px] border-arena bg-marfil px-5 py-2 text-sm font-medium text-grafito shadow-soft hover:border-salvia hover:text-salvia-oscuro disabled:opacity-60"
      >
        {cargando ? "Cargando…" : `Cargar más (${quedan})`}
      </button>
      <p aria-live="polite" className="text-xs text-grafito/50">
        Mostrando {cargados} de {total} {sustantivo}
      </p>
    </div>
  );
}
