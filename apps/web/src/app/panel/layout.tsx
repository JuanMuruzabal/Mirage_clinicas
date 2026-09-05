import { requireOnboardingComplete } from "@/lib/session";
import { PanelSidebar } from "@/components/panel/panel-sidebar";
import { PanelShell } from "@/components/panel/panel-shell";
import { AsistenciaCartelGlobal } from "@/components/panel/asistencia-cartel-global";
import { NotificacionesConflictoGlobal } from "@/components/panel/notificaciones-conflicto-global";

// Shell de gestión de clínica (T2.1, spec §4.1) — protegido, sidebar +
// contenido. pt-[var(--header-height)] compensa el header fixed (mismo
// criterio que el resto de las páginas sin foto, ver globals.css).
// `panel-texture` (TR-013 en docs/tradeoffs.md) es la textura de fondo
// cálida de las cuatro pantallas de gestión (General/Calendario/Turnos/
// Pacientes) — vive acá, en el contenedor raíz de ESTE layout nada más,
// nunca dentro de una card ni en marketing/onboarding/"Personalizá tu
// página" (esas rutas no pasan por este layout).
//
// "Estructura fija" en mobile (rama fix/mobile, 2026-08-24, pedido
// explícito del cliente: "el header superior queda FIJO... el sidebar...
// queda FIJO... la página en sí NO debe scrollear... solo el contenido
// se desliza") — todo con `max-md:`, cero cambio de escritorio (ese
// breakpoint no existe arriba de 768px, ver TR-026 en
// docs/tradeoffs.md):
//   - Esta raíz pasa a medir exactamente el viewport visible menos el
//     header y a no scrollear ella misma (`.panel-shell-h`, definida en
//     globals.css: `height` con fallback `vh`→`dvh` + `min-height: 0`,
//     ver el comentario ahí — sexta vuelta, TR-029 en docs/tradeoffs.md,
//     corrige el bug de scroll vertical roto de la ronda anterior) — así
//     el documento (html/body) nunca necesita scrollear, sin tocar
//     `app/layout.tsx` (compartido con el resto del sitio): esta raíz
//     simplemente deja de crecer más allá del viewport, así que el body
//     nunca tiene contenido que exceda su alto.
//   - `PanelSidebar` es un hermano de `<main>`, NO vive adentro del
//     `overflow-auto` de abajo — al no scrollear junto con el contenido,
//     queda visualmente fijo en su lugar (además de su propio `sticky`
//     existente, que sigue sin romper nada acá, solo se vuelve
//     redundante).
//   - `<main>` es el ÚNICO elemento que scrollea en mobile, en las DOS
//     direcciones (`overflow-x-auto overflow-y-auto`) — corrección
//     2026-08-24 sobre la versión anterior (ver TR-028 en
//     docs/tradeoffs.md): antes `<main>` solo scrolleaba vertical y cada
//     widget ancho (calendario, tablas) tenía su PROPIO scroll horizontal
//     aislado — el título/toolbar de cada página, sin ese scroll propio,
//     quedaban afuera y se comprimían con `flex-wrap`. Ahora título +
//     toolbar + widget son una sola unidad de scroll (mismo criterio que
//     `.contenido-scroll` en docs/referencia-para-claude-code.html, la
//     referencia que pasó el cliente): cada uno aporta su propio
//     `min-width` (ver calendar-view.tsx/turnos/page.tsx/etc.) y
//     `<main>` es el único que de verdad tiene `overflow`.
//   - `PanelShell` (octava corrección, TR-031 en docs/tradeoffs.md)
//     reemplaza el `<div>` raíz por un Client Component que fuerza un
//     reflow cada vez que cambia la ruta — mitigación adicional, no
//     terminó siendo la causa real (ver TR-032).
//   - `.panel-main-h` (novena corrección, TR-032 en docs/tradeoffs.md):
//     antes `<main>` NO tenía un alto propio — dependía por completo de
//     que el `flex` row de `PanelShell` lo estirara (`align-items:
//     stretch`) a la altura del viewport. Eso fallaba puntualmente en
//     Calendario y en la ficha de un paciente (las dos páginas con más
//     contenido ancho+alto a la vez) — el cliente reportó el contenido
//     "cortado de golpe, sin blanco", la firma de `overflow: hidden`
//     recortando porque el stretch heredado no se resolvía. Con un alto
//     EXPLÍCITO acá (mismo cálculo que el del sidebar, no depende de
//     ningún stretch), `<main>` queda acotado siempre y es su propio
//     `overflow-auto` el que absorbe el resto.
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  await requireOnboardingComplete();

  return (
    <PanelShell>
      <PanelSidebar />
      <main className="panel-main-h min-w-0 flex-1 max-md:min-h-0 max-md:overflow-x-auto max-md:overflow-y-auto max-md:overscroll-contain">
        {/* NotificacionesConflictoGlobal — pedido textual del cliente:
            aviso de conflicto (pacientes o calendario) visible desde
            CUALQUIER pantalla del panel, arriba del todo (ver
            docs/foto1.png). Primer hijo de `<main>`, antes que la propia
            página — cada pantalla se salta su propio aviso más
            específico para no duplicarlo (ver el componente). */}
        <NotificacionesConflictoGlobal />
        {children}
      </main>
      {/* AsistenciaCartelGlobal (TR-107, 1.3ter) — montado acá, no dentro
          de una página puntual, para que aparezca sin importar en qué
          pantalla del panel esté el profesional cuando un turno cumple
          su hora de fin. Usa un portal al body (ModalPortal), así que su
          posición en este árbol no afecta dónde se pinta. */}
      <AsistenciaCartelGlobal />
    </PanelShell>
  );
}
