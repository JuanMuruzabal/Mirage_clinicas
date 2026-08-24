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
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  await requireProfesional();

  return (
    <div className="panel-texture flex flex-1 pt-[var(--header-height)]">
      <PanelSidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
