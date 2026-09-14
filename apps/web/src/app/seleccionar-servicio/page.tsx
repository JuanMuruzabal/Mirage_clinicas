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
export default async function SeleccionarServicioPage() {
  const sesion = await requireOnboardingComplete();
  const tiene = (rol: string) => sesion.roles.includes(rol as (typeof sesion.roles)[number]);
  const gestionaAgenda = tiene("profesional") || tiene("recepcion");
  const administraPagina = tiene("admin");
  const token = await getSessionToken();
  const clinicasResult = token ? await apiMisClinicas(token) : null;
  const clinicas = clinicasResult?.ok ? clinicasResult.data.clinicas : [];

  return (
    // `hueso`, el mismo fondo que /clinicas: las tres pantallas con
    // tarjetas —dónde trabajás, qué necesitás, colaboradores— comparten
    // fondo, así que pasar de una a otra no se siente como cambiar de
    // aplicación. Lo que separa tarjeta de fondo es el borde de 1px en
    // `linea`, no un fondo más oscuro.
    <main className="flex flex-1 flex-col gap-12 bg-hueso px-6 py-16 pt-[calc(var(--header-height)+2rem)]">
      {/* `max-w-4xl` y no 1180px: es el ancho de /clinicas, la pantalla
          anterior. Pasar de una a la otra no tiene que sentirse como
          cambiar de aplicación — mismo ancho, mismo título, misma
          posición. */}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-1 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
            Hola, {sesion.nombre}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">
            ¿Qué necesitás hoy?
          </h1>
        </div>
        {/* `ml-auto` y no `self-end`: al envolverse, el selector quedaba
            pegado a la IZQUIERDA y su popover —anclado a la derecha del
            botón— se salía de la pantalla (reportado con captura).
            `self-end` no servía porque en un flex ROW alinea en el eje
            vertical; lo que empuja hacia la derecha en su propia línea es
            el margen automático. Contra el borde derecho, el popover cae
            hacia adentro. */}
        <div className="ml-auto">
          <SelectorClinica clinicas={clinicas} nombreActual={sesion.nombreClinica} />
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-4xl gap-6 sm:grid-cols-2">
        {gestionaAgenda && (
          <ScrollReveal className="sm:col-span-2">
            <NavCard
              href="/panel"
              variante="principal"
              titulo="Gestión de clínica"
              descripcion="La agenda de hoy, los pedidos pendientes y el resto de tu día a día."
            />
          </ScrollReveal>
        )}
        {administraPagina && (
          // Sin la tarjeta principal —alguien que SOLO administra la
          // página— esta pasa a ocupar el ancho completo: una tarjeta
          // sola en media grilla deja el otro medio vacío.
          <ScrollReveal delay={0.1} className={gestionaAgenda ? undefined : "sm:col-span-2"}>
            <NavCard
              href="/personalizar-pagina"
              variante={gestionaAgenda ? "normal" : "principal"}
              titulo="Personalización de página"
              descripcion="Especialidades, secciones y el enlace que compartís con tus pacientes."
              size="large"
            />
          </ScrollReveal>
        )}
        {tiene("owner") && (
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
