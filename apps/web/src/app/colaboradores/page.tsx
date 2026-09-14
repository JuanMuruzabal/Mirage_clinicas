import type { Metadata } from "next";
import Link from "next/link";
import { apiEquipo } from "@/lib/api";
import { getSessionToken, requireOnboardingComplete } from "@/lib/session";
import { EncabezadoEquipo, EquipoDeLaClinica } from "./equipo-de-la-clinica";

export const metadata: Metadata = { title: "Colaboradores — PRISMA" };

// /colaboradores — Fase 3.2.4, mockup `colaboradores.html`.
//
// Área propia, como /personalizar-pagina: no vive bajo /panel/**, porque
// no es una herramienta de la agenda sino de la clínica. Es la tercera
// tarjeta de "¿Qué necesitás hoy?".
//
// El guard es el de cualquier pantalla con clínica: VER el equipo lo
// puede cualquier miembro (saber con quién se trabaja no es un permiso
// especial). Invitar y quitar es otra cosa, y de eso se ocupa el backend
// — acá `puedeInvitar` solo decide qué se dibuja.
export default async function ColaboradoresPage() {
  const sesion = await requireOnboardingComplete();
  const token = await getSessionToken();
  const equipoResult = token ? await apiEquipo(token) : null;
  const equipo = equipoResult?.ok
    ? equipoResult.data
    : { miembros: [], pendientes: [], puedeInvitar: false };

  return (
    // `hueso-hondo` y no `hueso`: con tarjetas claras y muchas, el fondo
    // tiene que estar netamente más oscuro o no se lee dónde termina cada
    // una (rediseño del 2026-09-14). Y 880px de ancho: el contenido
    // estirado al viewport dejaba las tarjetas perdidas a la izquierda.
    <main className="flex flex-1 flex-col gap-8 bg-hueso-hondo px-6 py-10 pt-[calc(var(--header-height)+2.5rem)]">
      <div className="mx-auto w-full max-w-[880px]">
        <EncabezadoEquipo puedeInvitar={equipo.puedeInvitar}>
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
              <Link href="/clinicas" className="hover:text-salvia-oscuro">
                Clínicas
              </Link>
              <span aria-hidden="true">/</span>
              <span>{sesion.nombreClinica}</span>
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Colaboradores</h1>
            <p className="text-sm text-grafito/60">Quién trabaja en la clínica y qué puede ver cada uno.</p>
          </div>
        </EncabezadoEquipo>
      </div>

      <div className="mx-auto w-full max-w-[880px]">
        <EquipoDeLaClinica equipo={equipo} />
      </div>
    </main>
  );
}
