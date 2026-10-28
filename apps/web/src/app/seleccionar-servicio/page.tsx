import type { ComponentProps } from "react";
import type { Metadata } from "next";
import { requireOnboardingComplete } from "@/lib/session";
import { NavCard } from "@/components/nav-card";
import { Despliegue } from "@/components/panel/despliegue";
import { FondoOndas } from "@/components/fondo-ondas";
import { varianteDeDibujo } from "@/components/panel/dibujos-discretos";

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
// Rediseño del 2026-10-19 (pedido de la persona: "la veo algo rara en
// escritorio"). Reemplaza al del 2026-09-14 —"Gestión de clínica" a dos
// columnas con otra composición y las otras dos debajo, el selector a la
// derecha del título—:
//
//   - **Alineada a la izquierda, con un margen que crece con la pantalla**:
//     la pregunta y las tarjetas. Antes todo flotaba en una columna centrada.
//   - **Sin el selector de clínica**: se llega acá eligiendo la clínica en
//     /clinicas, y para cambiarla se vuelve ahí. El selector sigue en el
//     topbar del panel.
//   - **Las tres tarjetas son iguales y una debajo de la otra**, de vidrio
//     y con un dibujo de fondo cada una (`NavCard`). Se pierde la jerarquía
//     de "Gestión de clínica" como tarjeta principal, a propósito.
//   - **Sin el saludo**: /clinicas, la pantalla anterior, ya saluda. El h1
//     es la pregunta, en el degradé de los dibujos (`.titulo-prismatico`);
//     en las tarjetas, el título en petróleo y la descripción en grafito.
//   - **Entran con `Despliegue`** (TR-180), no con `ScrollReveal`: framer-
//     motion las escondía hasta hidratar, y su `opacity` en un ancestro le
//     cortaba el desenfoque al vidrio mientras duraba la entrada.
//
// Los dos destinos originales (/panel, /personalizar-pagina) son áreas
// separadas a propósito (pedido explícito del cliente, 2026-08-23:
// "personalizar pagina es una pagina aparte por fuera de gestion
// clinica").
//
// CADA TARJETA DEPENDE DE UN ROL (corrección del 2026-09-14). Antes esta
// pantalla mostraba las tres a cualquiera con la clínica cargada, así que
// un profesional invitado veía "Personalización de página" — una pantalla
// donde el backend le iba a rechazar cada acción (requireRol(admin),
// Fase 3.2.2). Ofrecer una puerta que del otro lado está cerrada es peor
// que no ofrecerla.
//
//   - **Gestión de clínica**: `profesional` o `recepcion`, que son los
//     que trabajan con la agenda.
//   - **Personalización de página**: `admin`, el administrador de PÁGINA
//     — el brief: "la tarjeta administrador de pagina solo la puede ver
//     los que tienen rol de administrador de página".
//   - **Colaboradores**: `owner`, que es quien invita y reparte roles.
//
// Con los tres roles —el caso del titular— se ven las tres. La regla real
// vive en el backend; acá solo se decide qué se dibuja.
export default async function SeleccionarServicioPage({
  searchParams,
}: {
  searchParams: Promise<{ dibujo?: string | string[] }>;
}) {
  const sesion = await requireOnboardingComplete();
  // A prueba (28/10): `?dibujo=icono|mancha|trazo` cambia el dibujo de las
  // tarjetas por una variante más discreta, para compararlas con datos
  // reales. Sin el parámetro, el objeto de siempre.
  const variante = varianteDeDibujo((await searchParams).dibujo);
  const tiene = (rol: string) => sesion.roles.includes(rol as (typeof sesion.roles)[number]);
  const gestionaAgenda = tiene("profesional") || tiene("recepcion");
  const administraPagina = tiene("admin");

  // El orden de siempre: la agenda, la página y el equipo.
  const servicios: ComponentProps<typeof NavCard>[] = [
    ...(gestionaAgenda
      ? [{ href: "/panel", dibujo: "agenda" as const, titulo: "Gestión de clínica", descripcion: "La agenda de hoy, los pedidos pendientes y el resto de tu día a día." }]
      : []),
    ...(administraPagina
      ? [{ href: "/personalizar-pagina", dibujo: "pagina" as const, titulo: "Personalización de página", descripcion: "Especialidades, secciones y el enlace que compartís con tus pacientes." }]
      : []),
    ...(tiene("owner")
      ? [{ href: "/colaboradores", dibujo: "equipo" as const, titulo: "Colaboradores", descripcion: "Quién trabaja en la clínica, con qué rol, y a quién invitar." }]
      : []),
  ];

  return (
    <>
      {/* FondoOndas (correcciones generales, ítem 1, 2026-10-10): el fondo
          de ondas de toda la app, en lugar de las crucecitas y del hueso
          plano. Va afuera de <main>, fijo y detrás del contenido. */}
      <FondoOndas />
      {/* Una columna centrada a `max-w-5xl`, con el mismo relleno a los dos
          lados (pedido de la persona, ítem 8, 2026-10-25): alineada a la
          izquierda, con el margen que crecía con la pantalla, dejaba un
          hueco vacío a la derecha en la computadora. El título NO se centra:
          queda contra el borde izquierdo de las tarjetas. Más anchas que
          `max-w-5xl` las tarjetas se estiraban sin nada que poner en el
          medio. Es la base de /clinicas. */}
      <main className="flex w-full flex-1 flex-col px-8 pb-16 pt-[calc(var(--header-height)+2rem)] max-md:px-[clamp(1rem,4vw,2rem)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          {/* En el degradé de los dibujos (`.titulo-prismatico`), en un
              <span> en línea (pedido de la persona, 2026-10-19). Un paso de
              diseño del ítem 8 (26/10) lo había pasado a petróleo con
              `CLASE_TITULO_DE_PANTALLA`; la persona lo pidió como estaba. */}
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
            <span className="titulo-prismatico">¿Qué necesitás hoy?</span>
          </h1>

          {/* Una tarjeta por fila, todas del mismo alto (`auto-rows-fr`): la
              de descripción más larga marca el de las tres. Entran con un
              fundido corto y no con el barrido de General (ítem 8,
              2026-10-25): es una pantalla de paso, el barrido demoraba el
              clic. */}
          <div className="grid auto-rows-fr gap-4">
            {servicios.map((servicio, orden) => (
              <Despliegue key={servicio.href} forma="fundido" orden={orden}>
                <NavCard {...servicio} variante={variante} />
              </Despliegue>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
