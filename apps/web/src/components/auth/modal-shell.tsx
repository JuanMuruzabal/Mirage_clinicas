import type { ReactNode } from "react";

interface ModalShellProps {
  title: string;
  subtitle?: string;
  /** Lo que va en el pie fijo — típicamente los botones del formulario. */
  footer: ReactNode;
  children: ReactNode;
}

// Modal de alta con encabezado y pie FIJOS — Fase 3.2.3, ronda de QA del
// 2026-09-13 (detalle en `docs/Fases post MVP/Fase 3/fase3.2-multi-tenant.md`).
//
// El problema que resuelve, textual del cliente: *"en tu versión hay que
// scrollear hasta el fondo para encontrar[lo]"* — el botón de acción
// quedaba al final de un formulario largo, así que en una pantalla baja
// el modal se veía como una lista de campos sin salida visible. Acá lo
// único que scrollea es el cuerpo: el título dice siempre dónde estás y
// el botón está siempre a la vista.
//
// **El botón vive FUERA del `<form>`**, y eso funciona por el atributo
// `form="..."` del HTML, que lo asocia igual. Es la única forma de tener
// un pie fijo sin sacar el formulario de su propio contenedor scrolleable
// (y sin duplicar el submit con JS).
//
// **520px de ancho**, no 900: *"a ancho completo, los inputs de dos
// columnas quedan enormes y el ojo tiene que viajar mucho"*.
export function ModalShell({ title, subtitle, footer, children }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-grafito/50 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-card border-[0.5px] border-arena bg-marfil shadow-soft">
        <header className="flex flex-col gap-1 border-b border-arena/70 px-6 py-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-medium text-grafito">{title}</h2>
          {subtitle && <p className="text-sm text-grafito/60">{subtitle}</p>}
        </header>

        {/* `min-h-0` es lo que hace que este hijo flex pueda encogerse y
            scrollear: sin eso, un contenido largo empuja el pie fuera de
            la pantalla en vez de generar scroll acá adentro. */}
        <div className="scrollbar-fina min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        <footer className="flex items-center justify-end gap-3 border-t border-arena/70 bg-marfil px-6 py-4">
          {footer}
        </footer>
      </div>
    </div>
  );
}

// SeccionCampos — los grupos con título del modal de perfil ("Datos
// personales" / "Datos profesionales"). Agrupar en dos bloques cortos
// convierte una lista de nueve campos en dos tareas, que es como la
// persona los tiene en la cabeza.
export function SeccionCampos({ titulo, icono, children }: { titulo: string; icono?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-grafito/50">
        {icono}
        {titulo}
      </h3>
      {children}
    </section>
  );
}
