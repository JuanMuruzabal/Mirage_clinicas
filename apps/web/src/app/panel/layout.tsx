import { requireProfesional } from "@/lib/session";
import { PanelSidebar } from "@/components/panel/panel-sidebar";

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
//     header (`100dvh`, no `100vh` — en mobile Safari `dvh` sí descuenta
//     la barra de direcciones) y a no scrollear ella misma
//     (`overflow-hidden`) — así el documento (html/body) nunca necesita
//     scrollear, sin tocar `app/layout.tsx` (compartido con el resto del
//     sitio): esta raíz simplemente deja de crecer más allá del
//     viewport, así que el body nunca tiene contenido que exceda su alto.
//   - `PanelSidebar` es un hermano de `<main>`, NO vive adentro del
//     `overflow-auto` de abajo — al no scrollear junto con el contenido,
//     queda visualmente fijo en su lugar (además de su propio `sticky`
//     existente, que sigue sin romper nada acá, solo se vuelve
//     redundante).
//   - `<main>` es el ÚNICO elemento que scrollea verticalmente en mobile
//     (`overflow-y-auto`) — cada página adentro fluye con su alto
//     natural (sin su propio recorte de alto en mobile, ver
//     calendar-view.tsx/turnos-table.tsx/etc.), así que scrollear acá
//     mueve el título+filtros+tabla juntos, como una página normal.
//     `overflow-x-hidden`: el scroll horizontal queda acotado a cada
//     componente ancho (calendario/tablas) por separado, no a toda la
//     pantalla — ver esos mismos componentes.
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  await requireProfesional();

  return (
    <div className="panel-texture flex flex-1 pt-[var(--header-height)] max-md:h-[100dvh] max-md:overflow-hidden">
      <PanelSidebar />
      <main
        className="min-w-0 flex-1 max-md:min-h-0 max-md:overflow-x-hidden max-md:overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </main>
    </div>
  );
}
