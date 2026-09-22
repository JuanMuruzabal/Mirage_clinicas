import type { ReactNode } from "react";
import { ESTADISTICAS } from "../../constantes";
import { CLASE_TARJETA_CHICA, CLASE_TEXTO_TENUE, Titulo } from "../../comunes";
import { listaDeConfig, textoDeConfig, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { VARIANTES } from "./variantes";

const CLASE_NUMERO = "font-[family-name:var(--font-display)] font-medium text-[var(--pp-acento-texto,var(--color-grafito))]";

function Estadisticas({ config, estadisticas }: { config: Record<string, unknown>; estadisticas: Record<string, number> }): ReactNode {
  const elegidas = ESTADISTICAS.filter((e) => listaDeConfig(config, "mostrar").includes(e.id));
  if (elegidas.length === 0) return null;
  const tituloPropio = textoDeConfig(config, "tituloPublico").trim();

  const cuerpo =
    varianteDeConfig(config, VARIANTES) === "franja" ? (
      // Franja: una banda ancha con los números grandes, sobre el acento suave del tema.
      <div className="flex flex-wrap items-center justify-around gap-6 rounded-(--pp-radio) bg-[var(--pp-acento-suave,var(--color-salvia-claro))] p-(--pp-relleno) text-center">
        {elegidas.map((e) => (
          <div key={e.id} className="flex flex-col items-center gap-1">
            <span className={`${CLASE_NUMERO} text-5xl`}>{estadisticas[e.id] ?? 0}</span>
            <span className={`text-sm ${CLASE_TEXTO_TENUE}`}>{e.etiqueta}</span>
          </div>
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-3">
        {elegidas.map((e) => (
          <div key={e.id} className={`${CLASE_TARJETA_CHICA} flex flex-col items-center justify-center gap-1 text-center`}>
            <span className={`${CLASE_NUMERO} text-3xl`}>{estadisticas[e.id] ?? 0}</span>
            <span className={`text-xs ${CLASE_TEXTO_TENUE}`}>{e.etiqueta}</span>
          </div>
        ))}
      </div>
    );

  if (!tituloPropio) return cuerpo;
  return (
    <div className="flex flex-col gap-3 text-center">
      <Titulo>{tituloPropio}</Titulo>
      {cuerpo}
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Estadisticas({ config: modulo.config, estadisticas: contexto.contenido.estadisticas });
  if (nodo === null) return null;
  const franja = varianteDeConfig(modulo.config, VARIANTES) === "franja";
  // Sin título propio no lleva link en el menú (como antes de PE-3).
  const etiqueta = textoDeConfig(modulo.config, "tituloPublico").trim() || null;
  return { id: "estadisticas", etiqueta, ancho: franja ? "completo" : "medio", contenido: nodo };
}
