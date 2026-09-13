import type { Metadata } from "next";
import { requireEmailVerificado, getSessionToken } from "@/lib/session";
import { apiListEspecialidades, apiMisClinicas } from "@/lib/api";
import { DondeTrabajas } from "./donde-trabajas";
import { PerfilOverlay } from "./perfil-overlay";

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
  const misClinicas = clinicasResult?.ok ? clinicasResult.data : { clinicas: [], codigoInvitacion: undefined };

  return (
    <>
      <main
        className={`flex flex-1 flex-col gap-12 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)] ${
          perfilIncompleto ? "pointer-events-none blur-sm select-none" : ""
        }`}
        aria-hidden={perfilIncompleto}
      >
        <div className="mx-auto w-full max-w-4xl">
          <p className="mb-1 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
            Hola, {me.perfil?.nombre ?? me.email}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">
            ¿Dónde trabajás hoy?
          </h1>
        </div>

        <div className="mx-auto flex w-full max-w-4xl flex-col gap-12">
          <DondeTrabajas clinicas={misClinicas.clinicas} codigoInicial={misClinicas.codigoInvitacion} />
        </div>
      </main>

      {perfilIncompleto && <PerfilOverlay me={me} especialidades={especialidades} />}
    </>
  );
}
