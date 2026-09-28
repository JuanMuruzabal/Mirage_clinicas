import "server-only";
import { redirect } from "next/navigation";
import { requireOnboardingComplete, type SesionCompleta } from "@/lib/session";
import { TIMEZONE_CORDOBA } from "@/lib/turno-format";

/** El módulo de documentos es solo de profesionales (TR-186). La pantalla
 *  verifica el rol, no solo el sidebar: esconder el botón nunca fue cerrar
 *  la puerta (CLAUDE.md, Fase 3.2.4). La API lo corta igual con 403. */
export async function requireProfesional(): Promise<SesionCompleta> {
  const sesion = await requireOnboardingComplete();
  if (!sesion.roles.includes("profesional")) redirect("/panel");
  return sesion;
}

/** Hoy en Córdoba, AAAA-MM-DD — lo que dice "Lugar y fecha" en la vista
 *  precargada de un documento. */
export function hoyEnCordoba(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE_CORDOBA }).format(new Date());
}
