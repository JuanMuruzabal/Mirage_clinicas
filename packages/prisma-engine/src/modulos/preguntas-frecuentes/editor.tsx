import { CLASE_BOTON_PELIGRO, CLASE_CAMPO, CLASE_ETIQUETA, Contador } from "../../comunes";
import { MAX_LARGO_PREGUNTA, MAX_LARGO_RESPUESTA, MAX_PREGUNTAS_FRECUENTES } from "./limites";
import type { EditorModuloProps } from "../../tipos";

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
    return [{
      pregunta: typeof registro.pregunta === "string" ? registro.pregunta : "",
      respuesta: typeof registro.respuesta === "string" ? registro.respuesta : "",
    }];
  });
}

export function Editor({ modulo, onConfig }: EditorModuloProps) {
  const preguntas = preguntasDe(modulo.config);

  function actualizar(indice: number, campo: keyof Pregunta, valor: string) {
    onConfig({
      ...modulo.config,
      preguntas: preguntas.map((item, i) => i === indice ? { ...item, [campo]: valor } : item),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-grafito/60">Agregá hasta {MAX_PREGUNTAS_FRECUENTES} preguntas y respuestas.</p>
      {preguntas.map((item, indice) => (
        <fieldset key={indice} className="flex flex-col gap-3 rounded-field border border-linea p-3">
          <legend className={CLASE_ETIQUETA}>Pregunta {indice + 1}</legend>
          <label className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>Pregunta</span>
            <input
              type="text"
              maxLength={MAX_LARGO_PREGUNTA}
              value={item.pregunta}
              onChange={(e) => actualizar(indice, "pregunta", e.target.value)}
              placeholder="Ej.: ¿Atienden con turno?"
              className={CLASE_CAMPO}
            />
            <Contador actual={item.pregunta.length} max={MAX_LARGO_PREGUNTA} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>Respuesta</span>
            <textarea
              rows={3}
              maxLength={MAX_LARGO_RESPUESTA}
              value={item.respuesta}
              onChange={(e) => actualizar(indice, "respuesta", e.target.value)}
              className={CLASE_CAMPO}
            />
            <Contador actual={item.respuesta.length} max={MAX_LARGO_RESPUESTA} />
          </label>
          <button
            type="button"
            className={`${CLASE_BOTON_PELIGRO} self-start`}
            aria-label={`Quitar pregunta ${indice + 1}`}
            onClick={() => onConfig({ ...modulo.config, preguntas: preguntas.filter((_, i) => i !== indice) })}
          >
            Quitar pregunta
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="self-start rounded-full border border-salvia px-3 py-1.5 text-xs font-medium text-salvia-oscuro hover:bg-salvia-claro disabled:cursor-not-allowed disabled:opacity-50"
        disabled={preguntas.length >= MAX_PREGUNTAS_FRECUENTES}
        onClick={() => onConfig({ ...modulo.config, preguntas: [...preguntas, { pregunta: "", respuesta: "" }] })}
      >
        Agregar pregunta
      </button>
    </div>
  );
}
