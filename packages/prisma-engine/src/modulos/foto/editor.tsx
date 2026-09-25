import { MAX_LARGO_ALT_FOTO, SUBTIPOS_FOTO } from "../../constantes";
import { CLASE_AYUDA, CLASE_ETIQUETA, DescripcionDeFoto } from "../../comunes";
import { subtipoDeConfig, textoDeConfig } from "../../lectura-config";
import type { EditorModuloProps } from "../../tipos";

function sinAlt(config: Record<string, unknown>): Record<string, unknown> {
  const resto = { ...config };
  delete resto.fotoAlt;
  return resto;
}

export function Editor({ modulo, onConfig, componentes }: EditorModuloProps) {
  const { config } = modulo;
  const subtipo = subtipoDeConfig(config);
  const { SubirFoto } = componentes;
  return (
    <div className="flex flex-col gap-3">
      <SubirFoto
        etiqueta="foto"
        url={textoDeConfig(config, "fotoUrl")}
        // Una foto nueva no es la que se describió: la descripción se va con la vieja.
        onSubida={(url) => onConfig({ ...sinAlt(config), fotoUrl: url })}
        onQuitar={() => onConfig({ ...sinAlt(config), fotoUrl: "" })}
      />
      {textoDeConfig(config, "fotoUrl") && (
        <DescripcionDeFoto
          valor={textoDeConfig(config, "fotoAlt")}
          max={MAX_LARGO_ALT_FOTO}
          onCambio={(fotoAlt) => onConfig(fotoAlt ? { ...config, fotoAlt } : sinAlt(config))}
        />
      )}
      <fieldset className="flex flex-col gap-1.5">
        <legend className={CLASE_ETIQUETA}>Formato</legend>
        <div role="radiogroup" aria-label="Formato de la foto" className="flex flex-wrap gap-3">
          {SUBTIPOS_FOTO.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 text-sm text-grafito">
              <input
                type="radio"
                name={`subtipo-${modulo.clave}`}
                checked={subtipo === s.id}
                onChange={() => onConfig({ ...config, subtipo: s.id })}
              />
              {s.etiqueta}
            </label>
          ))}
        </div>
        <span className={CLASE_AYUDA}>{SUBTIPOS_FOTO.find((s) => s.id === subtipo)?.descripcion}</span>
      </fieldset>
    </div>
  );
}
