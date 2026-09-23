import { CLASE_AYUDA, CLASE_ETIQUETA } from "../../comunes";
import { listaDeConfig } from "../../lectura-config";
import type { EditorModuloProps } from "../../tipos";
import { CATALOGO_COBERTURAS } from "./catalogo";

export function Editor({ modulo, onConfig }: EditorModuloProps) {
  const seleccionadas = new Set(listaDeConfig(modulo.config, "coberturas"));
  const consultaPorOtras = modulo.config.consultaPorOtras === true;

  function seleccionar(id: string, marcado: boolean) {
    const coberturas = new Set(listaDeConfig(modulo.config, "coberturas"));
    if (marcado) coberturas.add(id);
    else coberturas.delete(id);
    onConfig({ ...modulo.config, coberturas: CATALOGO_COBERTURAS.filter(({ id: opcion }) => coberturas.has(opcion)).map(({ id }) => id) });
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className={CLASE_ETIQUETA}>Coberturas que acepta la clínica</legend>
        {CATALOGO_COBERTURAS.map(({ id, nombre }) => (
          <label key={id} className="flex items-center gap-2 text-sm text-grafito">
            <input type="checkbox" checked={seleccionadas.has(id)} onChange={(e) => seleccionar(id, e.target.checked)} />
            {nombre}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm text-grafito">
        <input
          type="checkbox"
          checked={consultaPorOtras}
          onChange={(e) => onConfig({ ...modulo.config, consultaPorOtras: e.target.checked })}
        />
        Indicar que pueden consultar por otras coberturas
      </label>
      <p className={CLASE_AYUDA}>Solo se muestran en la página las opciones que marques.</p>
    </div>
  );
}
