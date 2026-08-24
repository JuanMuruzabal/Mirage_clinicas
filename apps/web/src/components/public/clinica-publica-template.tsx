import { QuadrantMark } from "@/components/quadrant-mark";
import { PedirTurnoForm } from "./pedir-turno-form";

interface ClinicaPublicaTemplateProps {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  telefono?: string | null;
  especialidades: string[];
}

// Plantilla pública fija (T4.3, spec §5.3) — sin editor de diseño
// todavía: estructura fija con las 3 secciones que pide la spec, en su
// mismo orden — turno, "Sobre nosotros" (placeholder, el contenido real
// queda para después) y especialidades.
//
// Piel propia (pedido explícito del cliente, 2026-08-23: "un fondo
// azulcito") — a diferencia del resto del producto (identidad cálida,
// TR-013/TR-015), la página pública de cada clínica es su propia
// "vidriera" de cara al paciente, no una herramienta de gestión, así que
// tiene un fondo celeste propio en vez de heredar el hueso/marfil del
// resto del sitio. Trae también su propio header básico con anclas a
// cada sección ("un header basico para ir directo a los datos de la
// pagina") — el ÚNICO header acá: el header global de Mirage no se
// muestra en esta ruta (ver SiteHeaderVisibility/isClinicaPublicaRoute en
// lib/site-routes.ts, pedido explícito del cliente: "que deje de verse el
// header de la pagina principal... se abrira en una pagina aparte
// independiente", pensando en el subdominio propio de spec §5 a futuro).
//
// Sin padding de página propio más allá del suyo (`px-6 py-16`): un solo
// componente para dos consumidores — la página real (`/[slug]`) y la
// previsualización en vivo del editor (`/personalizar-pagina`, T4.1) — así
// nunca se desincronizan.
export function ClinicaPublicaTemplate({
  slug,
  nombreClinica,
  profesionalNombre,
  telefono,
  especialidades,
}: ClinicaPublicaTemplateProps) {
  const tieneEspecialidades = especialidades.length > 0;

  return (
    <div className="flex flex-col gap-10 bg-[#e7f2f7] px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 text-center">
        <QuadrantMark className="text-3xl text-salvia" />
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito sm:text-5xl">{nombreClinica}</h1>
        {/* grafito/80, no /60 (el tono que se usa sobre marfil/hueso en el
            resto del producto) — sobre este fondo celeste, /60 da ~3.6:1,
            por debajo del 4.5:1 de AA para texto normal (verificado a
            mano); /80 da ~6.25:1. */}
        <p className="text-sm text-grafito/80">{profesionalNombre}</p>
      </div>

      <nav aria-label="Ir a una sección de esta página" className="mx-auto flex w-full max-w-xl flex-wrap justify-center gap-2">
        <a
          href="#turno"
          className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
        >
          Pedí tu turno
        </a>
        <a
          href="#sobre-nosotros"
          className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
        >
          Sobre nosotros
        </a>
        {tieneEspecialidades && (
          <a
            href="#especialidades"
            className="rounded-full border-[0.5px] border-arena bg-marfil px-4 py-1.5 text-xs font-medium text-grafito hover:border-salvia hover:text-salvia-oscuro"
          >
            Especialidades
          </a>
        )}
      </nav>

      <section id="turno" className="mx-auto w-full max-w-xl scroll-mt-6">
        <h2 className="mb-4 text-center font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Pedí tu turno</h2>
        <PedirTurnoForm slug={slug} nombreClinica={nombreClinica} telefonoClinica={telefono} />
      </section>

      <section
        id="sobre-nosotros"
        className="mx-auto w-full max-w-xl scroll-mt-6 rounded-card border-[0.5px] border-dashed border-arena bg-marfil p-6 text-center"
      >
        <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Sobre nosotros</h2>
        {/* Placeholder honesto, no contenido inventado (spec §5.3: "el
            contenido detallado de esta sección queda pendiente para
            después") — mismo criterio que los placeholders de historia
            clínica/presupuesto en la ficha de paciente. */}
        <p className="mt-2 text-sm text-grafito/60">
          Esta sección todavía no tiene contenido propio — {profesionalNombre} va a poder contar acá su perfil, su
          consultorio y su forma de trabajar en una próxima actualización.
        </p>
      </section>

      {tieneEspecialidades && (
        <section id="especialidades" className="mx-auto w-full max-w-xl scroll-mt-6 text-center">
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Especialidades</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {especialidades.map((esp) => (
              <span key={esp} className="rounded-full border-[0.5px] border-arena bg-marfil px-2.5 py-1 text-xs text-grafito/60">
                {esp}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
