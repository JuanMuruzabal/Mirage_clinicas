import type { ReactNode } from "react";
import { CLASE_TARJETA, Titulo } from "../../comunes";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";

function SobreNosotros({ bio }: { bio?: string | null }): ReactNode {
  const texto = bio?.trim();
  if (!texto) return null;
  return (
    <div className={`${CLASE_TARJETA} text-center`}>
      <Titulo>Sobre nosotros</Titulo>
      <p className="mt-2 whitespace-pre-line text-sm text-grafito/80">{texto}</p>
    </div>
  );
}

export function seccion(_modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = SobreNosotros({ bio: contexto.contenido.bio });
  if (nodo === null) return null;
  return { id: "sobre-nosotros", etiqueta: "Sobre nosotros", ancho: "completo", contenido: nodo };
}
