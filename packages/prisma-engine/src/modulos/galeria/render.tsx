import type { ReactNode } from "react";
import { CLASE_FOTO, Foto, Titulo } from "../../comunes";
import { listaDeConfig, textoDeConfig, tituloPublicoDe, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { VARIANTES } from "./variantes";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_GALERIA } from "../../efectos/slots";

// `sizes` de cada variante (PE-9): cuánto ocupa una foto en pantalla, para
// que el navegador baje la variante justa. Mosaico y grilla van en 2
// columnas (3 desde @xl) dentro de un contenedor de 48rem como mucho; el
// carrusel muestra 4/5 del ancho (1/2 desde @xl).
const TAMANOS_GRILLA = "(min-width: 48rem) 16rem, 50vw";
const TAMANOS_CARRUSEL = "(min-width: 48rem) 24rem, 80vw";

function Galeria({
  config,
  nombreClinica,
  esUrlDeFotoSegura,
  estiloMovimiento,
}: {
  config: Record<string, unknown>;
  nombreClinica: string;
  esUrlDeFotoSegura: (url: string) => boolean;
  estiloMovimiento?: ContextoPublico["estiloMovimiento"];
}): ReactNode {
  // La descripción se lee de la MISMA posición que la URL, antes de filtrar
  // las URLs inseguras (filtrar primero correría las descripciones).
  const alts = listaDeConfig(config, "fotoAlts");
  const fotos = listaDeConfig(config, "fotoUrls")
    .map((url, i) => ({ url, altPropio: (alts[i] ?? "").trim() }))
    .filter((f) => esUrlDeFotoSegura(f.url));
  if (fotos.length === 0) return null;
  // Sin título propio la galería no lleva encabezado (como antes de PE-3).
  const tituloPropio = textoDeConfig(config, "tituloPublico").trim();
  const variante = varianteDeConfig(config, VARIANTES);
  const alt = (i: number) => fotos[i].altPropio || `Foto ${i + 1} de ${nombreClinica}`;
  const envolver = envolverSlots(config, estiloMovimiento, SLOTS_GALERIA);

  let cuerpo: ReactNode;
  if (variante === "mosaico") {
    // Mosaico = columnas CSS: cada foto conserva su proporción real.
    cuerpo = (
      <div className="columns-2 gap-3 @xl:columns-3">
        {fotos.map(({ url }, i) => (
          <div key={`${url}-${i}`} className="mb-3 break-inside-avoid">{envolver("imagen", <Foto src={url} alt={alt(i)} className={`w-full ${CLASE_FOTO}`} />)}</div>
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
        {fotos.map(({ url }, i) => (
          <div key={`${url}-${i}`} className="w-4/5 flex-none snap-center @xl:w-1/2">{envolver("imagen", <Foto src={url} alt={alt(i)} className={`aspect-[4/3] w-full ${CLASE_FOTO}`} />)}</div>
        ))}
      </div>
    );
  } else {
    cuerpo = (
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
        {fotos.map(({ url }, i) => (
          <div key={`${url}-${i}`}>{envolver("imagen", <Foto src={url} alt={alt(i)} className={`aspect-square w-full ${CLASE_FOTO}`} />)}</div>
        ))}
      </div>
    );
  }
  if (!tituloPropio) return cuerpo;
  return (
    <div className="flex flex-col gap-3 text-center">
      {envolver("titulo", <Titulo>{tituloPropio}</Titulo>)}
      {cuerpo}
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_GALERIA);
  const nodo = Galeria({
    config: modulo.config,
    nombreClinica: contexto.nombreClinica,
    esUrlDeFotoSegura: contexto.utils.esUrlDeFotoSegura,
    estiloMovimiento: contexto.estiloMovimiento,
  });
  if (nodo === null) return null;
  return { id: "galeria", etiqueta: tituloPublicoDe(modulo.config, "Galería"), ancho: "completo", contenido: envolver("tarjeta", nodo) };
}
