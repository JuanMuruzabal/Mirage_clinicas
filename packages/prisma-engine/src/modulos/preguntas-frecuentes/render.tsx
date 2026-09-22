import type { ReactNode } from "react";
import { CLASE_ALINEAR, CLASE_TARJETA, CLASE_TEXTO, Titulo } from "../../comunes";
import { tituloPublicoDe } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_PREGUNTAS } from "./variantes";

interface Pregunta {
  pregunta: string;
  respuesta: string;
}

function preguntasDe(config: Record<string, unknown>): Pregunta[] {
  const valor = config.preguntas;
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((item): Pregunta[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const registro = item as Record<string, unknown>;
    const pregunta = typeof registro.pregunta === "string" ? registro.pregunta.trim() : "";
    const respuesta = typeof registro.respuesta === "string" ? registro.respuesta.trim() : "";
    return pregunta && respuesta ? [{ pregunta, respuesta }] : [];
  });
}

function PreguntasFrecuentes({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const preguntas = preguntasDe(modulo.config);
  if (preguntas.length === 0) return null;

  const titulo = tituloPublicoDe(modulo.config, "Preguntas frecuentes");
  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_PREGUNTAS);
  return (
    <div className={`${CLASE_TARJETA} ${CLASE_ALINEAR}`}>
      {envolver("titulo", <Titulo className="mb-4">{titulo}</Titulo>)}
      <div className="flex flex-col divide-y divide-(--pp-borde) text-left">
        {preguntas.map((item, indice) => envolver("tarjeta", (
          <details key={`pregunta-${indice}`} className="group py-3 first:pt-0 last:pb-0">
            <summary className={`cursor-pointer list-none font-medium text-(--pp-texto) marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--pp-acento)`}>
              <span className="flex items-start justify-between gap-4">
                <span>{item.pregunta}</span>
                <span aria-hidden="true" className="text-(--pp-acento-texto,var(--pp-texto))/70 transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className={`mt-2 whitespace-pre-line ${CLASE_TEXTO}`}>{item.respuesta}</p>
          </details>
        )))}
      </div>
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const contenido = PreguntasFrecuentes({ modulo, contexto });
  if (contenido === null) return null;
  return {
    id: "preguntas-frecuentes",
    etiqueta: tituloPublicoDe(modulo.config, "Preguntas frecuentes"),
    ancho: "completo",
    contenido,
  };
}
