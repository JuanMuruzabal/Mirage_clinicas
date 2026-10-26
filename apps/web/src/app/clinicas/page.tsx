import type { Metadata } from "next";
import { requireEmailVerificado, getSessionToken } from "@/lib/session";
import { apiListEspecialidades, apiMisClinicas } from "@/lib/api";
import { DondeTrabajas } from "./donde-trabajas";
import { PerfilOverlay } from "./perfil-overlay";
import { FondoOndas } from "@/components/fondo-ondas";

export const metadata: Metadata = { title: "¿Dónde trabajás hoy? — PRISMA" };

// El punto de partida de toda sesión — Fase 3.2.3.
//
// El brief lo pide literal: "al iniciar sesión o abrir la aplicación con
// una sesión activa siempre me llevará a este apartado, este siempre será
// el inicio de partida". Reemplaza a /seleccionar-servicio como destino
// post-login (TR-057, que lo era cuando cada persona tenía exactamente
// una clínica y no había nada que elegir).
//
// El perfil profesional es lo único que puede faltar para llegar acá: si
// falta, el modal se muestra POR ENCIMA de esta página, que queda
// desenfocada de fondo. Crear la clínica, en cambio, ya no es un paso
// obligatorio sino una de las opciones de la pantalla.
export default async function ClinicasPage() {
  const me = await requireEmailVerificado();
  const perfilIncompleto = !me.perfil;

  const token = await getSessionToken();
  const [especialidadesResult, clinicasResult] = await Promise.all([
    apiListEspecialidades(),
    // Sin perfil todavía no hay nada que listar, y el modal tapa la
    // pantalla igual: se evita el pedido.
    perfilIncompleto || !token ? Promise.resolve(null) : apiMisClinicas(token),
  ]);

  const especialidades = especialidadesResult.ok ? especialidadesResult.data : [];
  const misClinicas = clinicasResult?.ok
    ? clinicasResult.data
    : { clinicas: [], invitaciones: [], codigoInvitacion: undefined };

  return (
    <>
      {/* FondoOndas (correcciones generales, ítem 1): afuera de <main>
          porque <main> lleva `blur-sm` con el perfil incompleto, y un
          `filter` en un ancestro le cambia el bloque contenedor a un
          elemento fijo. */}
      <FondoOndas />
      {/* El mismo <main> que /seleccionar-servicio (ítem 14, 2026-10-19:
          "la misma clase de diseño debe tener las mismas decisiones de
          diseño"): una columna centrada a `max-w-5xl`, con el mismo relleno
          a los dos lados, y los títulos contra el borde izquierdo de las
          tarjetas (ítem 8, 2026-10-25). */}
      <main
        className={`flex w-full flex-1 flex-col px-8 pb-16 pt-[calc(var(--header-height)+2rem)] max-md:px-[clamp(1rem,4vw,2rem)] ${
          perfilIncompleto ? "pointer-events-none blur-sm select-none" : ""
        }`}
        aria-hidden={perfilIncompleto}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          {/* El saludo es propio de esta pantalla (de servicios se sacó porque
              acá ya saluda). Va en el estilo de los títulos, en el degradé de
              los dibujos (`.titulo-prismatico`) y más grande que la pregunta,
              que es el h1 a su tamaño de siempre. Un paso de diseño del ítem 8
              (26/10) lo había bajado a un renglón chico en grafito y llevado
              la pregunta a `CLASE_TITULO_DE_PANTALLA`; la persona lo pidió
              como estaba. */}
          <div className="flex flex-col gap-1">
            <p className="font-[family-name:var(--font-display)] text-4xl leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-5xl">
              <span className="titulo-prismatico">Hola, {me.perfil?.nombre ?? me.email}</span>
            </p>
            {/* La pregunta en el verde petróleo, como los títulos de las
                tarjetas (pedido de la persona, 2026-10-19); el saludo sigue
                prismático. */}
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-marca sm:text-4xl">
              ¿Dónde trabajás hoy?
            </h1>
          </div>

          <div className="flex flex-col gap-10">
            {/* `perfil` y `especialidades` viajan por el encadenado de la
                Fase 3.2.3: quien no atiende pacientes y quiere armar su
                propia clínica completa primero la matrícula que le falta,
                en un modal, sin salir de esta pantalla. */}
            <DondeTrabajas
              clinicas={misClinicas.clinicas}
              invitaciones={misClinicas.invitaciones}
              codigoInicial={misClinicas.codigoInvitacion}
              perfil={me.perfil}
              especialidades={especialidades}
            />
          </div>
        </div>
      </main>

      {perfilIncompleto && <PerfilOverlay me={me} especialidades={especialidades} />}
    </>
  );
}
