// La carga de la página pública de una clínica (PE-9), compartida por
// `generateMetadata`, la página y la imagen para compartir.
//
// Memoizada por request con `cache()` de React: sin esto, `generateMetadata`
// y la página pedían `/clinicas/{slug}` dos veces por visita (el fetch va con
// `cache: "no-store"`, así que Next no lo deduplica solo) — el doble de
// viajes a la API y de consultas a Postgres para el mismo HTML.
import { cache } from "react";
import type { ClinicaPublica } from "@dental-mirage/shared-types";
import { apiGetClinicaPublica, type ApiResult } from "@/lib/api";
import { clinicaDeDemostracion } from "./demostracion";

export const cargarClinicaPublica = cache(async (slug: string): Promise<ApiResult<ClinicaPublica>> => {
  const demo = clinicaDeDemostracion(slug);
  if (demo) return { ok: true, data: demo };
  return apiGetClinicaPublica(slug);
});
