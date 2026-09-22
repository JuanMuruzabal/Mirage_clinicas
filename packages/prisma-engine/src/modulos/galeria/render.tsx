import type { ReactNode } from "react";
import { CLASE_FOTO, Foto, Titulo } from "../../comunes";
import { listaDeConfig, textoDeConfig, tituloPublicoDe, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { VARIANTES } from "./variantes";

function Galeria({
  config,
  nombreClinica,
  esUrlDeFotoSegura,
}: {
  config: Record<string, unknown>;
  nombreClinica: string;
  esUrlDeFotoSegura: (url: string) => boolean;
}): ReactNode {
  const fotos = listaDeConfig(config, "fotoUrls").filter(esUrlDeFotoSegura);
  if (fotos.length === 0) return null;
  // Sin título propio la galería no lleva encabezado (como antes de PE-3).
  const tituloPropio = textoDeConfig(config, "tituloPublico").trim();
  const variante = varianteDeConfig(config, VARIANTES);
  const alt = (i: number) => `Foto ${i + 1} de ${nombreClinica}`;

  let cuerpo: ReactNode;
  if (variante === "mosaico") {
    // Mosaico = columnas CSS: cada foto conserva su proporción real.
    cuerpo = (
      <div className="columns-2 gap-3 @xl:columns-3">
        {fotos.map((url, i) => (
          <Foto key={`${url}-${i}`} src={url} alt={alt(i)} className={`mb-3 w-full break-inside-avoid ${CLASE_FOTO}`} />
        ))}
      </div>
    );
  } else if (variante === "carrusel") {
    // Carrusel sin JavaScript: scroll horizontal con snap. tabIndex=0 +
    // role/aria-label para que se pueda recorrer con el teclado.
    cuerpo = (
      <div
        role="region"
        aria-label={`Galería de ${nombreClinica}`}
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      >
        {fotos.map((url, i) => (
          <Foto key={`${url}-${i}`} src={url} alt={alt(i)} className={`aspect-[4/3] w-4/5 flex-none snap-center @xl:w-1/2 ${CLASE_FOTO}`} />
        ))}
      </div>
    );
  } else {
    cuerpo = (
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
        {fotos.map((url, i) => (
          <Foto key={`${url}-${i}`} src={url} alt={alt(i)} className={`aspect-square w-full ${CLASE_FOTO}`} />
        ))}
      </div>
    );
  }
  if (!tituloPropio) return cuerpo;
  return (
    <div className="flex flex-col gap-3 text-center">
      <Titulo>{tituloPropio}</Titulo>
      {cuerpo}
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = Galeria({
    config: modulo.config,
    nombreClinica: contexto.nombreClinica,
    esUrlDeFotoSegura: contexto.utils.esUrlDeFotoSegura,
  });
  if (nodo === null) return null;
  return { id: "galeria", etiqueta: tituloPublicoDe(modulo.config, "Galería"), ancho: "completo", contenido: nodo };
}
