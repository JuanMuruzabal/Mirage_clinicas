import { QuadrantMark } from "@/components/quadrant-mark";

interface PaginaEnPreparacionProps {
  nombreClinica: string;
}

// "Página en preparación" (PE-8, plan Prisma Engine, decidido por Kevin el
// 21/09) — lo que ve un visitante en `/{slug}` mientras la clínica nunca
// publicó ninguna versión (GET /clinicas/{slug} responde `enPreparacion:
// true`, sin ningún contenido). Antes de PE-8 esta ruta mostraba el
// borrador en vivo sin publicar — dejó de ser así: el borrador solo lo ve
// quien edita, desde /personalizar-pagina. Mismo criterio visual que
// PaginaEnMantenimiento (misma URL, otro estado, no una pantalla de error).
export function PaginaEnPreparacion({ nombreClinica }: PaginaEnPreparacionProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#e7f2f7] px-6 py-24 text-center">
      <QuadrantMark className="text-4xl text-salvia" />
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-grafito">{nombreClinica}</h1>
      <p className="max-w-sm text-sm text-grafito/80">Esta página está en preparación — volvé a visitarla más adelante.</p>
    </div>
  );
}
