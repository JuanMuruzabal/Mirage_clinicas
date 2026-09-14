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
    // `hueso`, el mismo fondo que "¿Qué necesitás hoy?" y /clinicas. Lo
    // que separa tarjeta de fondo es el borde de 1px en `linea`, no un
    // fondo más oscuro. 880px de ancho porque estirado al viewport las
    // tarjetas quedaban perdidas a la izquierda.
    <main className="flex flex-1 flex-col gap-8 bg-hueso px-6 py-10 pt-[calc(var(--header-height)+2.5rem)]">
      <div className="mx-auto w-full max-w-[880px]">
        <p className="mb-1 flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
          <Link href="/clinicas" className="hover:text-salvia-oscuro">
            Clínicas
          </Link>
          <span aria-hidden="true">/</span>
          <span>{sesion.nombreClinica}</span>
        </p>
        {/* El botón se alinea con el TÍTULO, no con el bloque entero: con
            el encabezado como una sola columna (breadcrumb + h1 +
            descripción) quedaba a la altura del breadcrumb, que es lo más
            chico de los tres. */}
        <EncabezadoEquipo puedeInvitar={equipo.puedeInvitar}>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">Colaboradores</h1>
          <p className="text-sm text-grafito/60">Quién trabaja en la clínica y qué puede ver cada uno.</p>
        </EncabezadoEquipo>
      </div>

      <div className="mx-auto w-full max-w-[880px]">
        <EquipoDeLaClinica equipo={equipo} />
      </div>
    </main>
  );
}
