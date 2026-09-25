import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { EstiloMovimiento, DefinicionSlotAnimable } from "./catalogo";
import { SlotDeModulo } from "./modulo";

/**
 * Envuelve un nodo con el efecto del slot. Si el nodo es un `<li>`, el efecto
 * va ADENTRO (envuelve su contenido) y el `<li>` sigue siendo hijo directo
 * del `<ul>` (PP-1, H7): los efectos se dibujan con un `<div>`/`<span>`, y
 * uno entre la lista y sus ítems rompe la semántica — el lector de pantalla
 * deja de anunciar "lista de N elementos". Resolverlo acá y no en cada
 * `render.tsx` cubre también a los módulos que se sumen después.
 */
export function envolverSlots(config: Record<string, unknown>, estiloMovimiento: EstiloMovimiento | undefined, slots: readonly DefinicionSlotAnimable[]) {
  return (id: string, nodo: ReactNode): ReactNode => {
    const slot = slots.find((s) => s.id === id);
    if (!slot) return nodo;
    if (isValidElement<{ children?: ReactNode }>(nodo) && nodo.type === "li") {
      const item = nodo as ReactElement<{ children?: ReactNode }>;
      return cloneElement(item, undefined, <SlotDeModulo config={config} slot={slot} estiloMovimiento={estiloMovimiento}>{item.props.children}</SlotDeModulo>);
    }
    return <SlotDeModulo key={isValidElement(nodo) ? nodo.key ?? undefined : undefined} config={config} slot={slot} estiloMovimiento={estiloMovimiento}>{nodo}</SlotDeModulo>;
  };
}
