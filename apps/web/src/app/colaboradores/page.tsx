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

      {/* La salida hacia el trabajo del día (2026-09-14). Crear una
          clínica de tipo "organización" ahora TERMINA acá, así que esta
          pantalla pasó a ser un punto de llegada y no solo un desvío
          desde "¿Qué necesitás hoy?" — sin esto, quien acaba de crear su
          clínica queda mirando un equipo vacío sin nada que lo lleve
          adelante.

          Detrás del mismo rol que la tarjeta "Gestión de clínica"
          (Fase 3.2.4): el panel es la agenda, y a alguien que SOLO
          administra la página pública no le sirve de nada. Ofrecer una
          puerta que del otro lado no lleva a ningún lado es el mismo
          error que se corrigió con las tarjetas. */}
      {(sesion.roles.includes("profesional") || sesion.roles.includes("recepcion")) && (
        <div className="mx-auto flex w-full max-w-[880px] justify-center">
          <Link
            href="/panel"
            className="inline-flex items-center gap-2 rounded-full border border-linea bg-marfil px-6 py-3 text-sm font-semibold text-grafito transition-colors hover:border-salvia hover:text-salvia-oscuro"
          >
            Ir al panel de gestión
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      )}
    </main>
  );
}
