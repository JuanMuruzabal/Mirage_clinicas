import type { Ref } from "react";
import { IconX } from "@/components/icons";

interface BotonCerrarProps {
  onClick: () => void;
  /** Nombre accesible; "Cerrar" salvo que haya otro en la misma pantalla. */
  etiqueta?: string;
  /** Para un fondo oscuro (la barra de la pantalla completa de un
   *  documento). Ahí va en una fila de botones de 44 px, junto a
   *  "Acercar": sin los márgenes negativos, que la pegaban al borde. */
  sobreOscuro?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * La cruz de cerrar de TODO diálogo, hoja y panel (correcciones generales,
 * ítem 3, pedido de la persona): "algunos componentes poseen el botón
 * 'cerrar' en vez de la cruz, otros poseen ambos; lo ideal es que solo esté
 * la cruz". Una sola, arriba a la derecha, con nombre accesible y 44 px
 * para el dedo. El margen negativo vertical la deja ocupar los 44 px sin
 * agrandar la cabecera que la contiene, y el de la derecha alinea la cruz
 * dibujada con el borde del contenido. El foco usa el anillo del navegador
 * (sin `outline-none`), como el resto de los botones del panel.
 */
export function BotonCerrar({ onClick, etiqueta = "Cerrar", sobreOscuro = false, className = "", ref }: BotonCerrarProps) {
  const tono = sobreOscuro ? "text-marfil hover:bg-marfil/10" : "-my-2 -mr-3 text-grafito/70 hover:bg-velo hover:text-grafito";
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${tono} ${className}`}
    >
      <IconX className="h-5 w-5" />
    </button>
  );
}
