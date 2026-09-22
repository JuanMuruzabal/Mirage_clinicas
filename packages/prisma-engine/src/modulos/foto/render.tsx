import type { ReactNode } from "react";
import { CLASE_FOTO, Foto } from "../../comunes";
import { subtipoDeConfig, textoDeConfig } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { SlotDeModulo } from "../../efectos/modulo";
import { SLOTS_FOTO } from "../../efectos/slots";

function FotoSuelta({
  config,
  nombreClinica,
  esUrlDeFotoSegura,
}: {
  config: Record<string, unknown>;
  nombreClinica: string;
  esUrlDeFotoSegura: (url: string) => boolean;
}): ReactNode {
  const url = textoDeConfig(config, "fotoUrl");
  if (!url || !esUrlDeFotoSegura(url)) return null;
  const subtipo = subtipoDeConfig(config);
  const forma =
    subtipo === "retrato" ? "mx-auto aspect-[3/4] w-full max-w-xs" : subtipo === "franja" ? "aspect-[21/6] w-full" : "aspect-[16/7] w-full";
  const clase = `${forma} ${CLASE_FOTO}`;
  return <Foto src={url} alt={`Foto de ${nombreClinica}`} className={clase} />;
}

export function seccion(modulo: ModuloBorrador, indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const nodo = FotoSuelta({
    config: modulo.config,
    nombreClinica: contexto.nombreClinica,
    esUrlDeFotoSegura: contexto.utils.esUrlDeFotoSegura,
  });
  if (nodo === null) return null;
  return { id: `foto-${indice}`, etiqueta: null, ancho: subtipoDeConfig(modulo.config) === "retrato" ? "medio" : "completo", contenido:
    <SlotDeModulo config={modulo.config} slot={SLOTS_FOTO[0]} estiloMovimiento={contexto.estiloMovimiento}>{nodo}</SlotDeModulo> };
}
