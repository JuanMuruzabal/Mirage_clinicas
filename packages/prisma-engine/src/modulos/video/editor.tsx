import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ETIQUETA } from "../../comunes";
import { textoDeConfig } from "../../lectura-config";
import type { EditorModuloProps } from "../../tipos";
import { videoEmbedSeguro } from "./url-video";

export function Editor({ modulo, onConfig }: EditorModuloProps) {
  const url = textoDeConfig(modulo.config, "url");
  const invalida = url.trim() !== "" && videoEmbedSeguro(url) === null;

  return (
    <label className="flex flex-col gap-1.5">
      <span className={CLASE_ETIQUETA}>Enlace de YouTube o Vimeo</span>
      <input
        type="url"
        maxLength={300}
        value={url}
        onChange={(e) => onConfig({ ...modulo.config, url: e.target.value })}
        placeholder="https://youtu.be/… o https://vimeo.com/…"
        aria-invalid={invalida || undefined}
        aria-describedby="ayuda-video"
        className={`${CLASE_CAMPO} ${invalida ? "border-terracota" : ""}`}
      />
      <span id="ayuda-video" className={invalida ? "text-xs text-terracota-oscuro" : CLASE_AYUDA}>
        {invalida
          ? "Ese enlace no es compatible. Usá un enlace HTTPS público de YouTube o Vimeo."
          : "Pegá el enlace público del video; no se aceptan otros sitios ni enlaces de reproducción en vivo."}
      </span>
    </label>
  );
}
