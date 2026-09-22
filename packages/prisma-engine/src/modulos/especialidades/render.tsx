import type { ReactNode } from "react";
import { CLASE_TITULO } from "../../comunes";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";

function Especialidades({ especialidades }: { especialidades: string[] }): ReactNode {
  if (especialidades.length === 0) return null;
  return (
    <div className="text-center">
      <h2 className={`mb-3 ${CLASE_TITULO}`}>Especialidades</h2>
      <div className="flex flex-wrap justify-center gap-2">
        {especialidades.map((esp) => (
          <span
            key={esp}
            className="rounded-full border-[0.5px] border-arena bg-[var(--pp-acento-suave,var(--color-marfil))] px-2.5 py-1 text-xs text-[var(--pp-acento-texto,var(--color-grafito))]"
          >
            {esp}
          </span>
        ))}
      </div>
    </div>
  );
}

export function seccion(_modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Especialidades({ especialidades: contexto.especialidades });
  if (nodo === null) return null;
  return { id: "especialidades", etiqueta: "Especialidades", ancho: "medio", contenido: nodo };
}
