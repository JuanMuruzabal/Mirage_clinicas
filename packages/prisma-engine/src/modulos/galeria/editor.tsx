import { MAX_LARGO_ALT_FOTO, TOPE_FOTOS_GALERIA } from "../../constantes";
import { CLASE_AYUDA, CLASE_BOTON_PELIGRO, DescripcionDeFoto } from "../../comunes";
import { listaDeConfig } from "../../lectura-config";
import type { EditorModuloProps } from "../../tipos";

/**
 * Escribe fotoUrls y fotoAlts juntas, alineadas posición por posición. Si
 * ninguna foto tiene descripción, `fotoAlts` se saca: la config no acumula
 * una lista de vacíos.
 */
function conFotos(config: Record<string, unknown>, urls: string[], alts: string[]): Record<string, unknown> {
  const resto = { ...config };
  delete resto.fotoAlts;
  const alineadas = urls.map((_url, i) => alts[i] ?? "");
  return alineadas.some((a) => a !== "") ? { ...resto, fotoUrls: urls, fotoAlts: alineadas } : { ...resto, fotoUrls: urls };
}

export function Editor({ modulo, onConfig, componentes }: EditorModuloProps) {
  const { config } = modulo;
  const fotos = listaDeConfig(config, "fotoUrls");
  const alts = listaDeConfig(config, "fotoAlts");
  const { SubirFoto } = componentes;
  return (
    <div className="flex flex-col gap-3">
      {fotos.length > 0 && (
        <ul className="flex flex-col gap-3">
          {fotos.map((url, i) => (
            <li key={`${url}-${i}`} className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="aspect-square w-20 flex-none rounded-field border-[0.5px] border-arena object-cover" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <DescripcionDeFoto
                  etiqueta={`Descripción de la foto ${i + 1}`}
                  valor={alts[i] ?? ""}
                  max={MAX_LARGO_ALT_FOTO}
                  onCambio={(alt) => onConfig(conFotos(config, fotos, fotos.map((_url, j) => (j === i ? alt : alts[j] ?? ""))))}
                />
                <button
                  type="button"
                  aria-label={`Quitar foto ${i + 1}`}
                  onClick={() =>
                    onConfig(
                      conFotos(
                        config,
                        fotos.filter((_url, j) => j !== i),
                        alts.filter((_alt, j) => j !== i),
                      ),
                    )
                  }
                  className={`${CLASE_BOTON_PELIGRO} self-start`}
                >
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {fotos.length < TOPE_FOTOS_GALERIA ? (
        <SubirFoto modo="agregar" etiqueta="foto" url="" onSubida={(url) => onConfig(conFotos(config, [...fotos, url], alts))} />
      ) : (
        <p className={CLASE_AYUDA}>Llegaste al máximo de {TOPE_FOTOS_GALERIA} fotos en la galería.</p>
      )}
    </div>
  );
}
