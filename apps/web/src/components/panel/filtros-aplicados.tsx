"use client";

export interface FiltroAplicado {
  clave: string;
  etiqueta: string;
  quitar: () => void;
}

// FiltrosAplicados — las etiquetas removibles de los filtros ya aplicados
// ("Esta semana ✕", "Consulta general ✕"), para las listas que filtran en
// la pantalla: los turnos de la ficha del paciente y sus documentos
// clínicos (pedido del cliente, 2026-09-29: en Turnos se veían y en esas
// dos no). Mismo dibujo que las de Turnos, que son links porque esa
// pantalla filtra por la URL; acá son botones, porque el filtro vive en el
// estado del componente. Sin filtros aplicados no dibuja nada.
export function FiltrosAplicados({ filtros }: { filtros: FiltroAplicado[] }) {
  if (filtros.length === 0) return null;
  return (
    <div role="group" aria-label="Filtros aplicados" className="flex flex-wrap items-center gap-2">
      {filtros.map((f) => (
        <button
          key={f.clave}
          type="button"
          onClick={f.quitar}
          aria-label={`Quitar filtro: ${f.etiqueta}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-salvia-claro px-3 py-1.5 text-xs font-medium text-salvia-oscuro hover:brightness-95"
        >
          {f.etiqueta}
          <span aria-hidden="true">✕</span>
        </button>
      ))}
    </div>
  );
}
