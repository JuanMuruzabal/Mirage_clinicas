import { MAX_LARGO_TEXTO_LIBRE, MAX_LARGO_TITULO_TEXTO } from "../../constantes";
import { CLASE_CAMPO, CLASE_ETIQUETA, Contador } from "../../comunes";
import { textoDeConfig } from "../../lectura-config";
import type { EditorModuloProps } from "../../tipos";

export function Editor({ modulo, onConfig }: EditorModuloProps) {
  const { config } = modulo;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className={CLASE_ETIQUETA}>Título</span>
        <input
          type="text"
          maxLength={MAX_LARGO_TITULO_TEXTO}
          value={textoDeConfig(config, "titulo")}
          onChange={(e) => onConfig({ ...config, titulo: e.target.value })}
          placeholder="Ej.: Nuestra filosofía"
          className={CLASE_CAMPO}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={CLASE_ETIQUETA}>Texto</span>
        <textarea
          rows={5}
          maxLength={MAX_LARGO_TEXTO_LIBRE}
          value={textoDeConfig(config, "texto")}
          onChange={(e) => onConfig({ ...config, texto: e.target.value })}
          className={CLASE_CAMPO}
        />
        <Contador actual={textoDeConfig(config, "texto").length} max={MAX_LARGO_TEXTO_LIBRE} />
      </label>
    </div>
  );
}
