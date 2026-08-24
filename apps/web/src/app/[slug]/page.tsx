import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiGetClinicaPublica } from "@/lib/api";
import { ClinicaPublicaTemplate } from "@/components/public/clinica-publica-template";
import { PaginaEnMantenimiento } from "@/components/public/pagina-en-mantenimiento";

// Página pública de una clínica (spec §5, ruta `/clinica-x`). Plantilla
// fija completa desde T4.3 (spec §5.3: turno, "Sobre nosotros",
// especialidades) vía ClinicaPublicaTemplate — mismo componente que
// previsualiza en vivo el editor (T4.1, /personalizar-pagina). `oculta` (T4.4)
// muestra el modo mantenimiento en vez del contenido; no depende de
// `deployadaEn` — esta URL se puede previsualizar antes del primer
// deploy, lo que no aparece antes de deployar es en el buscador (T4.5).
//
// Sin el header/footer globales de Mirage (pedido explícito del cliente,
// 2026-08-23 — ver isClinicaPublicaRoute en lib/site-routes.ts): esta
// página es la "vidriera" propia de cada clínica, pensada para vivir en
// su propio subdominio más adelante (spec §5, "Futuro: subdominio
// propio"). Sin el header fijo global no hace falta compensar su
// altura — el fondo/padding de la página los pone la plantilla (o el
// mantenimiento) en sí.
export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await apiGetClinicaPublica(slug);
  if (!result.ok) return {};
  return { title: `${result.data.nombreClinica} — Dental Mirage` };
}

export default async function ClinicaPublicaPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const result = await apiGetClinicaPublica(slug);
  if (!result.ok) {
    notFound();
  }
  const clinica = result.data;

  return (
    <main className="flex flex-1 flex-col">
      {clinica.oculta ? (
        <PaginaEnMantenimiento nombreClinica={clinica.nombreClinica} />
      ) : (
        <ClinicaPublicaTemplate
          slug={clinica.slug}
          nombreClinica={clinica.nombreClinica}
          profesionalNombre={clinica.profesionalNombre}
          telefono={clinica.telefono}
          especialidades={clinica.especialidades}
        />
      )}
    </main>
  );
}
