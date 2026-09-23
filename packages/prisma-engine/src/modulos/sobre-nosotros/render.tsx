import type { ReactNode } from "react";
import { BloqueDeTexto } from "../../comunes";
import { textoDeConfig, tituloPublicoDe, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { VARIANTES } from "./variantes";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_TEXTO, SLOTS_IMAGEN } from "../../efectos/slots";

function SobreNosotros({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const texto = contexto.contenido.bio?.trim();
  if (!texto) return null;
  const fotoUrl = textoDeConfig(modulo.config, "fotoUrl");
  const foto = fotoUrl && contexto.utils.esUrlDeFotoSegura(fotoUrl) ? { src: fotoUrl, alt: `Foto de ${contexto.nombreClinica}` } : null;
  return (
    <BloqueDeTexto
      titulo={tituloPublicoDe(modulo.config, "Sobre nosotros")}
      texto={texto}
      variante={varianteDeConfig(modulo.config, VARIANTES)}
      foto={foto}
      envolverSlot={envolverSlots(modulo.config, contexto.estiloMovimiento, [...SLOTS_TEXTO, ...SLOTS_IMAGEN])}
    />
  );
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = SobreNosotros({ modulo, contexto });
  if (nodo === null) return null;
  return { id: "sobre-nosotros", etiqueta: tituloPublicoDe(modulo.config, "Sobre nosotros"), ancho: "completo", contenido: nodo };
}
