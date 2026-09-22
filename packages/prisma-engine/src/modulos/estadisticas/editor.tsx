import { ESTADISTICAS } from "../../constantes";
import { CLASE_AYUDA, CLASE_ETIQUETA } from "../../comunes";
import { listaDeConfig } from "../../lectura-config";
import type { EditorModuloProps } from "../../tipos";

export function Editor({ modulo, onConfig }: EditorModuloProps) {
  const { config } = modulo;
  const elegidas = listaDeConfig(config, "mostrar");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={CLASE_ETIQUETA}>Qué mostrar</legend>
      {ESTADISTICAS.map((e) => (
        <label key={e.id} className="flex items-start gap-2 text-sm text-grafito">
          <input
            type="checkbox"
            className="mt-1"
            checked={elegidas.includes(e.id)}
            onChange={(ev) => onConfig({ ...config, mostrar: ev.target.checked ? [...elegidas, e.id] : elegidas.filter((x) => x !== e.id) })}
          />
          <span>
            {e.etiqueta}
            <span className={`${CLASE_AYUDA} block`}>{e.descripcion}</span>
          </span>
        </label>
      ))}
      <span className={CLASE_AYUDA}>Son números reales del sistema: no se cargan a mano.</span>
    </fieldset>
  );
}
