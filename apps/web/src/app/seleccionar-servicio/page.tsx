import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboardingComplete } from "@/lib/session";
import { NavCard } from "@/components/nav-card";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = { title: "¿Qué necesitás hoy? — PRISMA" };

// Pantalla de selección de servicios (02-seleccion-servicios.png, T1.4).
//
// Fase 3.2.3 — deja de ser el destino post-login y pasa a ser la pantalla
// SIGUIENTE a "¿Dónde trabajás hoy?" (/clinicas). Dos cambios que vienen
// de ahí:
//
//   - El modal de bienvenida (TR-057) ya no vive acá. El perfil se carga
//     en /clinicas y la clínica dejó de ser un paso obligatorio del
//     onboarding, así que esta página vuelve a ser lo que su nombre dice:
//     elegir qué hacer, no completar el alta. El guard pasa a ser
//     `requireOnboardingComplete`, que manda a /clinicas si falta algo.
//   - Se muestra en qué clínica está parada la persona (pedido explícito
//     del brief: "marcar el nombre de la clínica que se seleccionó
//     anteriormente... para saber dónde estoy parado"). Con N clínicas,
//     entrar a la equivocada y no notarlo es el error caro de esta fase.
//
// Los dos destinos (/panel, /personalizar-pagina) son dos áreas separadas
// a propósito (pedido explícito del cliente, 2026-08-23: "personalizar
// pagina es una pagina aparte por fuera de gestion clinica") — ninguna
// vive dentro de la otra. Identidad cálida del panel (TR-013 en
// docs/Arquitectura y base/tradeoffs.md).
export default async function SeleccionarServicioPage() {
  const sesion = await requireOnboardingComplete();

  return (
    <main className="flex flex-1 flex-col gap-12 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <div className="mx-auto w-full max-w-4xl">
        <p className="mb-1 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
          Hola, {sesion.nombre}
        </p>
        <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-grafito/60">
          Estás en
          <span className="rounded-full bg-salvia-claro px-3 py-1 font-medium text-salvia-oscuro">{sesion.nombreClinica}</span>
          <Link href="/clinicas" className="text-salvia-oscuro underline underline-offset-4 hover:text-grafito">
            Cambiar de clínica
          </Link>
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">
          ¿Qué necesitás hoy?
        </h1>
      </div>

      <div className="mx-auto grid w-full max-w-4xl gap-8 sm:grid-cols-2">
        <ScrollReveal>
          <NavCard
            href="/panel"
            titulo="Gestión de clínica"
            descripcion="La agenda de hoy, los pedidos pendientes y el resto de tu día a día."
            size="large"
          />
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <NavCard
            href="/personalizar-pagina"
            titulo="Personalización de página"
            descripcion="Especialidades, secciones y el enlace que compartís con tus pacientes."
            size="large"
          />
        </ScrollReveal>
      </div>
    </main>
  );
}
