import type { EstiloMovimiento, IntensidadEfecto } from "./catalogo";
import { efectoPorDefecto, type DefinicionSlotAnimable } from "./catalogo";
import { EfectoSlot } from "./slot";
import type { ReactNode } from "react";

export function SlotDeModulo({ config, slot, estiloMovimiento, children }: {
  config: Record<string, unknown>;
  slot: DefinicionSlotAnimable;
  estiloMovimiento?: EstiloMovimiento;
  children: ReactNode;
}) {
  const efectos = config.efectos && typeof config.efectos === "object" ? config.efectos as Record<string, unknown> : {};
  const elegido = efectos[slot.id] && typeof efectos[slot.id] === "object" ? efectos[slot.id] as Record<string, unknown> : undefined;
  const id = typeof elegido?.id === "string" ? elegido.id : efectoPorDefecto(estiloMovimiento ?? "quieto", slot.objetivo);
  const intensidad = elegido?.intensidad === "media" || elegido?.intensidad === "marcada" ? elegido.intensidad as IntensidadEfecto : "sutil";
  if (id === "ninguno") return children;
  return <EfectoSlot id={id} intensidad={intensidad}>{children}</EfectoSlot>;
}
