import { TOPE_FOTOS_GALERIA } from "../../constantes";
import { CLASE_AYUDA, CLASE_BOTON_PELIGRO } from "../../comunes";
import { listaDeConfig } from "../../lectura-config";
import type { EditorModuloProps } from "../../tipos";

export function Editor({ modulo, onConfig, componentes }: EditorModuloProps) {
  const { config } = modulo;
  const fotos = listaDeConfig(config, "fotoUrls");
  const { SubirFoto } = componentes;
  return (
    <div className="flex flex-col gap-3">
      {fotos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {fotos.map((url, i) => (
            <li key={`${url}-${i}`} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-full rounded-field border-[0.5px] border-arena object-cover" />
              <button
                type="button"
                aria-label={`Quitar foto ${i + 1}`}
                onClick={() => onConfig({ ...config, fotoUrls: fotos.filter((_, j) => j !== i) })}
                className={CLASE_BOTON_PELIGRO}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {fotos.length < TOPE_FOTOS_GALERIA ? (
        <SubirFoto modo="agregar" etiqueta="foto" url="" onSubida={(url) => onConfig({ ...config, fotoUrls: [...fotos, url] })} />
      ) : (
        <p className={CLASE_AYUDA}>Llegaste al máximo de {TOPE_FOTOS_GALERIA} fotos en la galería.</p>
      )}
    </div>
  );
}
