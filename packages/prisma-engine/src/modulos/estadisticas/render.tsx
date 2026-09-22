import type { ReactNode } from "react";
import { ESTADISTICAS } from "../../constantes";
import { CLASE_TARJETA } from "../../comunes";
import { listaDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";

function Estadisticas({ config, estadisticas }: { config: Record<string, unknown>; estadisticas: Record<string, number> }): ReactNode {
  const elegidas = ESTADISTICAS.filter((e) => listaDeConfig(config, "mostrar").includes(e.id));
  if (elegidas.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {elegidas.map((e) => (
        <div key={e.id} className={`${CLASE_TARJETA} flex flex-col items-center justify-center gap-1 !p-4 text-center`}>
          <span className="font-[family-name:var(--font-display)] text-3xl font-medium text-[var(--pp-acento-texto,var(--color-grafito))]">
            {estadisticas[e.id] ?? 0}
          </span>
          <span className="text-xs text-grafito/70">{e.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Estadisticas({ config: modulo.config, estadisticas: contexto.contenido.estadisticas });
  if (nodo === null) return null;
  return { id: "estadisticas", etiqueta: null, ancho: "medio", contenido: nodo };
}
