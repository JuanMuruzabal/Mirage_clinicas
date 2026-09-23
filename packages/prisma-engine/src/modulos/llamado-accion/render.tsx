import type { ReactNode } from "react";
import { CLASE_ALINEAR, CLASE_TARJETA, CLASE_TEXTO, Titulo } from "../../comunes";
import { textoDeConfig, tituloPublicoDe } from "../../lectura-config";
import type { ContextoPublico, ModuloBorrador, SeccionPublica } from "../../tipos";
import { envolverSlots } from "../../efectos/envolver-slots";
import { SLOTS_LLAMADO } from "./variantes";

function destinoSeguro(modulo: ModuloBorrador, contexto: ContextoPublico): { href: string; externo: boolean } | null {
  const destino = modulo.config.destino;
  if (destino === "turno") return { href: "#turno", externo: false };
  if (destino === "whatsapp") {
    const href = contexto.telefono ? contexto.utils.urlDeRedSocial("whatsapp", contexto.telefono) : null;
    return href ? { href, externo: true } : null;
  }
  if (destino === "telefono") {
    const href = contexto.telefono ? contexto.utils.hrefDeTelefono(contexto.telefono) : null;
    return href ? { href, externo: false } : null;
  }
  // Las configuraciones anteriores a este módulo pueden no tener `destino`.
  return { href: "#turno", externo: false };
}

function LlamadoAccion({ modulo, contexto }: { modulo: ModuloBorrador; contexto: ContextoPublico }): ReactNode {
  const texto = textoDeConfig(modulo.config, "texto").trim();
  const accion = destinoSeguro(modulo, contexto);
  if (!texto || !accion) return null;

  const titulo = tituloPublicoDe(modulo.config, "Contactanos");
  const etiquetaBoton = textoDeConfig(modulo.config, "etiquetaBoton").trim() || "Pedí un turno";
  const envolver = envolverSlots(modulo.config, contexto.estiloMovimiento, SLOTS_LLAMADO);
  return envolver("tarjeta", (
    <div className={`${CLASE_TARJETA} flex flex-col items-center gap-4 text-center ${CLASE_ALINEAR}`}>
      {envolver("titulo", <Titulo>{titulo}</Titulo>)}
      <p className={`max-w-prose whitespace-pre-line ${CLASE_TEXTO}`}>{texto}</p>
      {envolver("boton", (
        <a
          href={accion.href}
          target={accion.externo ? "_blank" : undefined}
          rel={accion.externo ? "noopener noreferrer" : undefined}
          className="inline-flex items-center justify-center rounded-[var(--pp-boton-radio,9999px)] border-[length:var(--pp-boton-borde-ancho,0px)] border-[var(--pp-boton-borde,transparent)] bg-[var(--pp-boton-fondo,var(--color-salvia-oscuro))] px-6 py-3 text-sm font-semibold text-[var(--pp-boton-texto,var(--color-marfil))] shadow-soft hover:brightness-95"
        >
          {etiquetaBoton}
        </a>
      ))}
    </div>
  ));
}

export function seccion(modulo: ModuloBorrador, _indice: number, contexto: ContextoPublico): SeccionPublica | null {
  const contenido = LlamadoAccion({ modulo, contexto });
  if (contenido === null) return null;
  return { id: "llamado-accion", etiqueta: null, ancho: "completo", contenido };
}
