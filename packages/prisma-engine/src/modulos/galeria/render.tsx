import type { ReactNode } from "react";
import { Foto } from "../../comunes";
import { listaDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";

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
  return (
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
      {fotos.map((url, i) => (
        <Foto key={`${url}-${i}`} src={url} alt={`Foto ${i + 1} de ${nombreClinica}`} className="aspect-square w-full rounded-card object-cover" />
      ))}
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
  return { id: "galeria", etiqueta: "Galería", ancho: "completo", contenido: nodo };
}
