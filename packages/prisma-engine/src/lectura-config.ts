import type { SubtipoFoto } from "./tipos";

// Lectura tipada de la config (jsonb sin forma común): un valor ausente o de
// otro tipo da el neutro, nunca rompe — ni el editor ni el render pueden
// reventar por una config vieja/incompleta que quedó de otra versión.

export function textoDeConfig(config: Record<string, unknown>, clave: string): string {
  const v = config[clave];
  return typeof v === "string" ? v : "";
}

export function listaDeConfig(config: Record<string, unknown>, clave: string): string[] {
  const v = config[clave];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function subtipoDeConfig(config: Record<string, unknown>): SubtipoFoto {
  const v = config.subtipo;
  return v === "retrato" || v === "franja" ? v : "banner";
}

/** La variante de un módulo (PE-3): una que no está en su lista (o ninguna) vale la primera. */
export function varianteDeConfig<T extends string>(config: Record<string, unknown>, variantes: readonly T[]): T {
  const v = config.variante;
  return typeof v === "string" && (variantes as readonly string[]).includes(v) ? (v as T) : variantes[0];
}

/** El título que ve el visitante (PE-3): el propio si lo cargaron, si no el de siempre. */
export function tituloPublicoDe(config: Record<string, unknown>, porDefecto: string): string {
  return textoDeConfig(config, "tituloPublico").trim() || porDefecto;
}
