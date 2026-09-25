import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClinicaPublicaTemplate } from "@/components/public/clinica-publica-template";
import { PaginaEnMantenimiento } from "@/components/public/pagina-en-mantenimiento";
import { PaginaEnPreparacion } from "@/components/public/pagina-en-preparacion";
import { cargarClinicaPublica } from "@/lib/pagina-publica/cargar";
import { contenidoDeClinicaPublica } from "@/lib/pagina-publica/contenido";
import { jsonLdDeClinica, seoDeClinica, serializarJsonLd } from "@/lib/pagina-publica/seo";
import { urlDelSitio } from "@/lib/sitio";

// Página pública de una clínica (spec §5, ruta `/clinica-x`). Plantilla
// fija completa desde T4.3 (spec §5.3: turno, "Sobre nosotros",
// especialidades) vía ClinicaPublicaTemplate — mismo componente que
// previsualiza en vivo el editor (T4.1, /personalizar-pagina).
//
// PE-8 (plan Prisma Engine): esta ruta sirve la ÚLTIMA VERSIÓN PUBLICADA,
// no el borrador en vivo. `enPreparacion` (nunca se publicó nada) muestra
// "Página en preparación"; `oculta` (T4.4) muestra el modo mantenimiento —
// las dos son independientes de `deployadaEn`/el buscador (T4.5), que sigue
// exigiendo el primer Publicar aparte.
//
// Sin el header/footer globales de Mirage (pedido explícito del cliente,
// 2026-08-23 — ver isClinicaPublicaRoute en lib/site-routes.ts): esta
// página es la "vidriera" propia de cada clínica, pensada para vivir en
// su propio subdominio más adelante (spec §5, "Futuro: subdominio
// propio"). Sin el header fijo global no hace falta compensar su
// altura — el fondo/padding de la página los pone la plantilla (o el
// mantenimiento) en sí.
//
// SEO (PE-9): título y descripción los del admin o los por defecto
// (lib/pagina-publica/seo.ts), canonical, Open Graph y la tarjeta de X. La
// imagen para compartir la agrega sola la convención `opengraph-image.tsx`
// de esta misma carpeta. Una página en preparación o en mantenimiento va
// `noindex`: no hay nada que un buscador deba guardar de ella (y tampoco
// figura en el sitemap).
export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await cargarClinicaPublica(slug);
  if (!result.ok) return {};
  const clinica = result.data;
  const sitio = urlDelSitio();
  if (clinica.enPreparacion || clinica.oculta) {
    return { metadataBase: new URL(sitio), title: `${clinica.nombreClinica} — PRISMA`, robots: { index: false, follow: false } };
  }
  const { titulo, descripcion } = seoDeClinica(clinica);
  const url = `${sitio}/${clinica.slug}`;
  return {
    // metadataBase acá y no en el layout raíz: se lee en runtime (ver
    // lib/sitio.ts), y el `metadata` del layout es estático, se evalúa en el
    // build — donde SITE_URL todavía no existe.
    metadataBase: new URL(sitio),
    title: titulo,
    description: descripcion,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "es_AR", url, siteName: clinica.nombreClinica, title: titulo, description: descripcion },
    twitter: { card: "summary_large_image", title: titulo, description: descripcion },
  };
}

export default async function ClinicaPublicaPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const result = await cargarClinicaPublica(slug);
  if (!result.ok) {
    notFound();
  }
  const clinica = result.data;
  const publicada = !clinica.enPreparacion && !clinica.oculta;
  const sitio = urlDelSitio();

  return (
    <main className="flex flex-1 flex-col">
      {/* JSON-LD (PE-9): datos estructurados para buscadores. Es un bloque
          de datos, no un script que se ejecute — la CSP (script-src con
          nonce) no aplica a `application/ld+json`. */}
      {publicada && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializarJsonLd(jsonLdDeClinica(clinica, `${sitio}/${clinica.slug}`, sitio)) }}
        />
      )}
      {clinica.enPreparacion ? (
        <PaginaEnPreparacion nombreClinica={clinica.nombreClinica} />
      ) : clinica.oculta ? (
        <PaginaEnMantenimiento nombreClinica={clinica.nombreClinica} />
      ) : (
        <ClinicaPublicaTemplate
          slug={clinica.slug}
          nombreClinica={clinica.nombreClinica}
          telefono={clinica.telefono}
          especialidades={clinica.especialidades}
          contenido={contenidoDeClinicaPublica(clinica)}
        />
      )}
    </main>
  );
}
