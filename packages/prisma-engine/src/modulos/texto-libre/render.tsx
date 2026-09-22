import type { ReactNode } from "react";
import { BloqueDeTexto } from "../../comunes";
import { textoDeConfig, varianteDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { VARIANTES } from "./variantes";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_TEXTO, SLOTS_IMAGEN } from "../../efectos/slots";

// "Texto libre" ya tiene su propio `titulo` (que además es el link del menú),
// así que no ofrece `tituloPublico` — ver opcionesDeSeccion en meta.ts.
function TextoLibre({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const titulo = textoDeConfig(modulo.config, "titulo").trim();
  const texto = textoDeConfig(modulo.config, "texto").trim();
  if (!titulo && !texto) return null;
  const fotoUrl = textoDeConfig(modulo.config, "fotoUrl");
  const foto =
    fotoUrl && contexto.utils.esUrlDeFotoSegura(fotoUrl) ? { src: fotoUrl, alt: titulo || `Foto de ${contexto.nombreClinica}` } : null;
  return <BloqueDeTexto titulo={titulo} texto={texto} variante={varianteDeConfig(modulo.config, VARIANTES)} foto={foto}
    envolverSlot={envolverSlots(modulo.config, contexto.estiloMovimiento, [...SLOTS_TEXTO, ...SLOTS_IMAGEN])} />;
}

export function seccion(modulo: ModuloBorrador, indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const titulo = textoDeConfig(modulo.config, "titulo").trim();
  const nodo = TextoLibre({ modulo, contexto });
  if (nodo === null) return null;
  return { id: `texto-${indice}`, etiqueta: titulo || null, ancho: "completo", contenido: nodo };
}
