import type { Metadata } from "next";
import { apiMisClinicas } from "@/lib/api";
import { getSessionToken, requireOnboardingComplete } from "@/lib/session";
import { NavCard } from "@/components/nav-card";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SelectorClinica } from "./selector-clinica";

export const metadata: Metadata = { title: "¿Qué necesitás hoy? — PRISMA" };

// Pantalla de selección de servicios (02-seleccion-servicios.png, T1.4).
//
// Fase 3.2.3 — deja de ser el destino post-login y pasa a ser la pantalla
// SIGUIENTE a "¿Dónde trabajás hoy?" (/clinicas). El modal de bienvenida
// (TR-057) ya no vive acá: el perfil se carga en /clinicas y la clínica
// dejó de ser un paso obligatorio del onboarding, así que esta página
// vuelve a ser lo que su nombre dice — elegir qué hacer, no completar el
// alta. El guard es `requireOnboardingComplete`, que manda a /clinicas si
// falta algo.
//
// Rediseño del 2026-09-14, dos problemas concretos:
//
//   - **Las tres tarjetas eran del mismo tamaño**, así que la acción
//     principal no se distinguía y la tercera quedaba sola dejando media
//     pantalla vacía. Ahora "Gestión de clínica" ocupa las dos columnas
//     con otra composición (horizontal, con botón sólido), y las otras
//     dos van debajo, una en cada columna.
//   - **"Estás en [píldora] Cambiar de clínica" eran tres tratamientos
//     visuales para una sola idea**, apretados abajo del saludo. Pasa a
//     ser un control único a la derecha del título, que además llena ese
//     costado — el encabezado tenía todo el peso a la izquierda.
//
// Los dos destinos originales (/panel, /personalizar-pagina) son áreas
// separadas a propósito (pedido explícito del cliente, 2026-08-23:
// "personalizar pagina es una pagina aparte por fuera de gestion
// clinica"). La tercera tarjeta, Colaboradores, llegó con la Fase 3.2.4 y
// **solo la ve el titular**: es quien puede invitar y repartir roles.
export default async function SeleccionarServicioPage() {
  const sesion = await requireOnboardingComplete();
  const token = await getSessionToken();
  const clinicasResult = token ? await apiMisClinicas(token) : null;
  const clinicas = clinicasResult?.ok ? clinicasResult.data.clinicas : [];

  return (
    // `hueso-hondo` y no `hueso`: tarjeta y fondo eran dos cremas casi
    // idénticos y no se veía dónde terminaba cada una. Mismo fondo que
    // /colaboradores, que tiene el mismo problema a resolver.
    <main className="flex flex-1 flex-col gap-12 bg-hueso-hondo px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-1 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
            Hola, {sesion.nombre}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">
            ¿Qué necesitás hoy?
          </h1>
        </div>
        <SelectorClinica clinicas={clinicas} nombreActual={sesion.nombreClinica} />
      </div>

      <div className="mx-auto grid w-full max-w-[1180px] gap-[1.6rem] sm:grid-cols-2">
        <ScrollReveal className="sm:col-span-2">
          <NavCard
            href="/panel"
            variante="principal"
            titulo="Gestión de clínica"
            descripcion="La agenda de hoy, los pedidos pendientes y el resto de tu día a día."
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
        {sesion.rol === "owner" && (
          <ScrollReveal delay={0.2}>
            <NavCard
              href="/colaboradores"
              titulo="Colaboradores"
              descripcion="Quién trabaja en la clínica, con qué rol, y a quién invitar."
              size="large"
            />
          </ScrollReveal>
        )}
      </div>
    </main>
  );
}
