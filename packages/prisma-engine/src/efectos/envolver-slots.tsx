import { isValidElement, type ReactNode } from "react";
import type { EstiloMovimiento, DefinicionSlotAnimable } from "./catalogo";
import { SlotDeModulo } from "./modulo";

export function envolverSlots(config: Record<string, unknown>, estiloMovimiento: EstiloMovimiento | undefined, slots: readonly DefinicionSlotAnimable[]) {
  return (id: string, nodo: ReactNode): ReactNode => {
    const slot = slots.find((s) => s.id === id);
    return slot ? <SlotDeModulo key={isValidElement(nodo) ? nodo.key ?? undefined : undefined} config={config} slot={slot} estiloMovimiento={estiloMovimiento}>{nodo}</SlotDeModulo> : nodo;
  };
}
