import type { Metadata } from "next";
import { requireProfesional } from "@/lib/session";
import { NavCard } from "@/components/nav-card";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = { title: "¿Qué necesitás hoy? — Dental Mirage" };

// Pantalla de selección de servicios (02-seleccion-servicios.png, T1.4).
// Requiere sesión — sin cuenta creada no hay nada que gestionar ni página
// que personalizar (spec §3, paso 6). Los dos destinos (/panel,
// /personalizar-pagina) son dos áreas separadas a propósito (pedido
// explícito del cliente, 2026-08-23: "personalizar pagina es una pagina
// aparte por fuera de gestion clinica") — ninguna vive dentro de la otra,
// se construyeron en Sprint 2 y Sprint 4 respectivamente y las tarjetas ya
// apuntan ahí. Identidad cálida del panel (TR-013 en
// docs/tradeoffs.md, pedido explícito del cliente 2026-08-23: "que posea
// la misma identidad del frontend") — es la antesala del panel, no
// marketing, pero sin la textura de fondo (esa queda reservada a las
// cuatro pantallas de gestión, ver panel/layout.tsx).
export default async function SeleccionarServicioPage() {
  const profesional = await requireProfesional();

  return (
    <main className="flex flex-1 flex-col gap-12 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <div className="mx-auto w-full max-w-4xl">
        {/* "Volver al inicio" vive en el header global, justo detrás del
            wordmark (pedido explícito del cliente, 2026-08-23) — no hace
            falta repetirlo acá. */}
        <p className="mb-1 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
          Hola, {profesional.nombre.split(" ")[0]}
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
  );
}
