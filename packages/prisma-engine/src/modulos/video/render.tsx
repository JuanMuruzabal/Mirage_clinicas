import type { ReactNode } from "react";
import { CLASE_ALINEAR, CLASE_TARJETA, Titulo } from "../../comunes";
import { textoDeConfig, tituloPublicoDe } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { envolverSlots } from "../../efectos/envolver-slots";
import { videoEmbedSeguro } from "./url-video";
import { SLOTS_VIDEO } from "./variantes";

function Video({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const embed = videoEmbedSeguro(textoDeConfig(modulo.config, "url"));
  if (!embed) return null;

  const titulo = tituloPublicoDe(modulo.config, "Video");
  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_VIDEO);
  return (
    <div className={`${CLASE_TARJETA} flex flex-col gap-3 ${CLASE_ALINEAR}`}>
      {envolver("titulo", <Titulo>{titulo}</Titulo>)}
      {envolver("tarjeta", (
        <div className="aspect-video w-full overflow-hidden rounded-(--pp-radio) border-[0.5px] border-(--pp-borde) bg-(--pp-fondo)">
          <iframe
            src={embed.src}
            title={`${titulo} — ${contexto.nombreClinica}`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      ))}
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const contenido = Video({ modulo, contexto });
  if (contenido === null) return null;
  return {
    id: "video",
    etiqueta: tituloPublicoDe(modulo.config, "Video"),
    ancho: "completo",
    contenido,
  };
}
