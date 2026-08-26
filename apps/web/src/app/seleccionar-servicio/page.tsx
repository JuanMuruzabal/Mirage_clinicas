import type { Metadata } from "next";
import { requireEmailVerificado } from "@/lib/session";
import { apiListEspecialidades } from "@/lib/api";
import { NavCard } from "@/components/nav-card";
import { ScrollReveal } from "@/components/scroll-reveal";
import { BienvenidaOverlay } from "./bienvenida-overlay";

export const metadata: Metadata = { title: "¿Qué necesitás hoy? — Dental Mirage" };

// Pantalla de selección de servicios (02-seleccion-servicios.png, T1.4).
// Requiere sesión y mail verificado — TR-057 en docs/tradeoffs.md (pedido
// explícito del cliente, 2026-08-26): esta pantalla es el destino ÚNICO
// tras confirmar la cuenta, sin importar si perfil/clínica ya están
// completos. Si no lo están, el modal de "bienvenida" (perfil + clínica,
// lo que antes era el Paso 2/3 de /sumarse) se muestra por encima,
// bloqueando la interacción — la página de atrás queda visible pero
// desenfocada (`blur`), nunca interactiva mientras el modal esté arriba.
//
// Los dos destinos (/panel, /personalizar-pagina) son dos áreas separadas
// a propósito (pedido explícito del cliente, 2026-08-23: "personalizar
// pagina es una pagina aparte por fuera de gestion clinica") — ninguna
// vive dentro de la otra. Identidad cálida del panel (TR-013 en
// docs/tradeoffs.md).
export default async function SeleccionarServicioPage() {
  const [me, especialidadesResult] = await Promise.all([requireEmailVerificado(), apiListEspecialidades()]);
  const especialidades = especialidadesResult.ok ? especialidadesResult.data : [];
  const onboardingIncompleto = !me.onboardingCompletado;

  return (
    <>
      <main
        className={`flex flex-1 flex-col gap-12 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)] ${
          onboardingIncompleto ? "pointer-events-none blur-sm select-none" : ""
        }`}
        aria-hidden={onboardingIncompleto}
      >
        <div className="mx-auto w-full max-w-4xl">
          {/* El logo del header global ya vuelve siempre a "/" (TR-060 en
              docs/tradeoffs.md) — no hace falta un link aparte acá. */}
          <p className="mb-1 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
            Hola, {me.perfil?.nombre ?? me.email}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">
            ¿Qué necesitás hoy?
          </h1>
        </div>

        <div className="mx-auto grid w-full max-w-4xl gap-8 sm:grid-cols-2">
          <ScrollReveal>
            <NavCard
              href="/panel"
              titulo="Gestioná tu clínica"
              descripcion="La agenda de hoy, los pedidos pendientes y el resto de tu día a día."
              size="large"
            />
          </ScrollReveal>
          <ScrollReveal delay={0.1}>
            <NavCard
              href="/personalizar-pagina"
              titulo="Personalizá tu página"
              descripcion="Especialidades, secciones y el enlace que compartís con tus pacientes."
              size="large"
            />
          </ScrollReveal>
        </div>
      </main>

      {onboardingIncompleto && <BienvenidaOverlay me={me} especialidades={especialidades} />}
    </>
  );
}
