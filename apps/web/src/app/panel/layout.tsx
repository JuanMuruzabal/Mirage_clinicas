import { requireProfesional } from "@/lib/session";
import { PanelSidebar } from "@/components/panel/panel-sidebar";
import { PanelShell } from "@/components/panel/panel-shell";

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
//     reflow cada vez que cambia la ruta — bug real de iOS Safari: sin
//     esto, `<main>` a veces no reconocía que tenía contenido nuevo hasta
//     que algo más tocaba el DOM (justo el síntoma reportado: "se
//     arregla momentáneamente cuando cambio de dia a semana").
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  await requireProfesional();

  return (
    <PanelShell>
      <PanelSidebar />
      <main className="min-w-0 flex-1 max-md:min-h-0 max-md:overflow-x-auto max-md:overflow-y-auto max-md:overscroll-contain">
        {children}
      </main>
    </PanelShell>
  );
}
