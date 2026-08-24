import { QuadrantMark } from "@/components/quadrant-mark";

interface PaginaEnMantenimientoProps {
  nombreClinica: string;
}

// Modo mantenimiento (T4.4, spec §5.2) — lo que ve un visitante mientras
// el profesional oculta su página desde el editor (PATCH
// /panel/pagina/ocultar — esa es la ruta de la API, ver pagina-editor.tsx
// para el editor en sí, /personalizar-pagina). No es un error de
// verdad (no hay 404/500 detrás de esto), por eso es su propia pantalla y
// no notFound(). Mismo fondo celeste que ClinicaPublicaTemplate — es el
// mismo URL en otro estado, no debería sentirse como una página distinta.
export function PaginaEnMantenimiento({ nombreClinica }: PaginaEnMantenimientoProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#e7f2f7] px-6 py-24 text-center">
      <QuadrantMark className="text-4xl text-salvia" />
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">{nombreClinica}</h1>
      {/* grafito/80, no /60 — ver el mismo ajuste de contraste en
          ClinicaPublicaTemplate. */}
      <p className="max-w-sm text-sm text-grafito/80">Esta página está en mantenimiento — volvé a intentarlo más tarde.</p>
    </div>
  );
}
