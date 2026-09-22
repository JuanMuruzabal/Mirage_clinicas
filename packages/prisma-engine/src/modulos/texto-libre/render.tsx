import type { ReactNode } from "react";
import { CLASE_TARJETA, Titulo } from "../../comunes";
import { textoDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";

function TextoLibre({ config }: { config: Record<string, unknown> }): ReactNode {
  const titulo = textoDeConfig(config, "titulo").trim();
  const texto = textoDeConfig(config, "texto").trim();
  if (!titulo && !texto) return null;
  return (
    <div className={`${CLASE_TARJETA} text-center`}>
      {titulo && <Titulo>{titulo}</Titulo>}
      {texto && <p className={`${titulo ? "mt-2 " : ""}whitespace-pre-line text-sm text-grafito/80`}>{texto}</p>}
    </div>
  );
}

export function seccion(modulo: ModuloBorrador, indice: number, _contexto: ContextoPublico): SeccionPublica | null {
  const titulo = textoDeConfig(modulo.config, "titulo").trim();
  const nodo = TextoLibre({ config: modulo.config });
  if (nodo === null) return null;
  return { id: `texto-${indice}`, etiqueta: titulo || null, ancho: "completo", contenido: nodo };
}
