import { Suspense } from "react";
import { QuadrantMark } from "@/components/quadrant-mark";
import { CONTENIDO_VACIO, type ContenidoPagina } from "@/lib/pagina-publica/contenido";
import { esUrlDeFotoSegura } from "@/lib/pagina-publica/enlaces";
import { modulosPorDefecto } from "@/lib/pagina-publica/modulos";
import { colorDeNombre } from "@/lib/pagina-publica/portada";
import { estiloDeTema } from "@/lib/temas-pagina-publica/aplicar";
import { PedirTurnoButton } from "./pedir-turno-button";
import { MisTurnosButton } from "./mis-turnos-button";
import { seccionDeModulo, type SeccionPublica } from "./modulos-publicos";

interface ClinicaPublicaTemplateProps {
  slug: string;
  nombreClinica: string;
  profesionalNombre: string;
  telefono?: string | null;
  especialidades: string[];
  /**
   * Lo que la página muestra además de lo fijo: tema, portada y módulos.
   * Sin esto se dibuja la estructura de una página que nadie personalizó.
   */
  contenido?: ContenidoPagina;
}

const CLASE_LINK_MENU =
  "rounded-full border-[0.5px] border-arena bg-marfil px-4 py-1.5 text-xs font-medium text-grafito hover:border-[var(--pp-acento,var(--color-salvia))] hover:text-[var(--pp-acento-texto,var(--color-salvia-oscuro))]";

// Plantilla pública (T4.3, spec §5.3; dinámica desde la Fase 4.5). Lo
// FIJO es la portada (nombre + foto), el menú y "Pedí tu turno" — van
// siempre, y en ese orden. Lo demás es una lista de módulos que arma el
// admin de la clínica en /personalizar-pagina (orden, visibilidad y
// contenido), sobre una grilla de una columna en pantallas angostas y dos
// desde tablet.
//
// Piel propia (pedido explícito del cliente, 2026-08-23: "un fondo
// azulcito") — a diferencia del resto del producto (identidad cálida,
// TR-013/TR-015), la página pública de cada clínica es su propia
// "vidriera" de cara al paciente, no una herramienta de gestión, así que
// tiene un fondo celeste propio en vez de heredar el hueso/marfil del
// resto del sitio. Desde la Fase 4.5 ese celeste es el aspecto POR DEFECTO:
// si la clínica eligió un tema (paleta + tipografía), lo pisa; sin tema no
// cambia nada, para no mover el aspecto de las páginas que ya existen.
// Trae también su propio header básico con anclas a cada sección — el
// ÚNICO header acá: el header global de Mirage no se muestra en esta ruta
// (ver SiteHeaderVisibility/isClinicaPublicaRoute en lib/site-routes.ts,
// pedido explícito del cliente: "que deje de verse el header de la pagina
// principal... se abrira en una pagina aparte independiente", pensando en
// el subdominio propio de spec §5 a futuro).
//
// Sin padding de página propio más allá del suyo (`px-6 py-16`): un solo
// componente para dos consumidores — la página real (`/[slug]`) y la
// previsualización en vivo del editor (`/personalizar-pagina`) — así
// nunca se desincronizan.
//
// El `@container` está SOLO alrededor de la grilla de módulos, no de toda
// la plantilla: el wizard de turno y "Mis turnos" abren sus modales con
// `position: fixed` desde adentro de esta plantilla, y un ancestro con
// `container-type` es el bloque contenedor de sus descendientes fijos
// (contención de layout) — el modal dejaría de cubrir la pantalla y
// quedaría recortado al ancho de la página. Las consultas por contenedor
// (y no por viewport) son lo que deja al editor previsualizar mobile/
// tablet/desktop acotando el ancho de la vista previa.
export function ClinicaPublicaTemplate({
  slug,
  nombreClinica,
  profesionalNombre,
  telefono,
  especialidades,
  contenido,
}: ClinicaPublicaTemplateProps) {
  const c = contenido ?? { ...CONTENIDO_VACIO, modulos: modulosPorDefecto() };
  const tema = estiloDeTema(c.tema, c.temaVariante, c.temaTipografia);
  const portada = c.fotoPortadaUrl && esUrlDeFotoSegura(c.fotoPortadaUrl) ? c.fotoPortadaUrl : null;
  // El nombre sobre la foto solo tiene sentido CON foto: sin ella no hay
  // dónde ponerlo y se dibuja debajo, como siempre — la opción no rompe una
  // página a la que después le sacan la portada.
  const nombreSobreFoto = portada !== null && c.nombreSobrePortada;
  const colorNombre = colorDeNombre(c.nombreColor);

  const secciones = c.modulos
    .map((m, i) => seccionDeModulo(m, i, { nombreClinica, telefono, especialidades, contenido: c }))
    .filter((s): s is SeccionPublica => s !== null);
  const linksDelMenu = secciones.filter((s) => s.etiqueta !== null);

  return (
    <div className={tema.className} style={tema.style}>
      <div className="flex flex-col gap-10 bg-[var(--pp-fondo,#e7f2f7)] px-6 py-16">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 text-center">
          {portada && (
            <div className="relative mb-3 w-full overflow-hidden rounded-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portada} alt={`Portada de ${nombreClinica}`} className="aspect-[16/7] w-full object-cover" />
              {nombreSobreFoto && (
                <>
                  {/* El velo es lo que hace legible el nombre sobre CUALQUIER
                      foto: un degradé desde abajo, oscuro para los colores
                      claros y claro para el negro (ver portada.ts). */}
                  <div
                    aria-hidden="true"
                    className={`absolute inset-0 ${
                      colorNombre.velo === "claro"
                        ? "bg-gradient-to-t from-white/80 via-white/30 to-transparent"
                        : "bg-gradient-to-t from-black/70 via-black/25 to-transparent"
                    }`}
                  />
                  <h1
                    className="absolute inset-x-0 bottom-0 break-words px-6 pb-5 text-center font-[family-name:var(--font-display)] text-3xl font-medium"
                    style={{
                      color: colorNombre.hex,
                      textShadow: colorNombre.velo === "claro" ? "0 1px 6px rgba(255,255,255,0.6)" : "0 1px 8px rgba(0,0,0,0.45)",
                    }}
                  >
                    {nombreClinica}
                  </h1>
                </>
              )}
            </div>
          )}
          {!nombreSobreFoto && (
            <>
              <QuadrantMark className="text-3xl text-[var(--pp-acento,var(--color-salvia))]" />
              <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium text-grafito">{nombreClinica}</h1>
            </>
          )}
          {/* grafito/80, no /60 (el tono que se usa sobre marfil/hueso en el
              resto del producto) — sobre este fondo celeste, /60 da ~3.6:1,
              por debajo del 4.5:1 de AA para texto normal (verificado a
              mano); /80 da ~6.25:1. */}
          <p className="text-sm text-grafito/80">{profesionalNombre}</p>
        </div>

        <nav aria-label="Ir a una sección de esta página" className="mx-auto flex w-full max-w-xl flex-wrap justify-center gap-2">
          <a href="#turno" className={CLASE_LINK_MENU}>
            Pedí tu turno
          </a>
          {linksDelMenu.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={CLASE_LINK_MENU}>
              {s.etiqueta}
            </a>
          ))}
        </nav>

        {/* Fase 2.4.1 (corrección de QA sobre F4.1.6): esta sección ya no
            embebe el wizard directo — es solo el botón que lo abre por
            encima de la página (ver PedirTurnoButton). */}
        <section id="turno" className="mx-auto flex w-full max-w-xl scroll-mt-6 flex-col items-center gap-4 text-center">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-grafito">Pedí tu turno</h2>
          <p className="text-sm text-grafito/70">Elegí el horario que más te convenga en simples pasos.</p>
          {/* Suspense (Fase 2, ítem 5): PedirTurnoButton lee `?enlace=` con
              useSearchParams — Next.js exige un límite de Suspense
              alrededor de cualquier Client Component que lo use, si no la
              build falla. El fallback replica el tamaño del botón real
              para no saltar de layout mientras se hidrata. */}
          <Suspense fallback={<span className="inline-block h-[52px] w-[168px] animate-pulse rounded-full bg-marfil/60" aria-hidden="true" />}>
            <PedirTurnoButton slug={slug} nombreClinica={nombreClinica} telefonoClinica={telefono} />
          </Suspense>
          {/* Pedido textual del cliente: botón "MIS TURNOS" debajo de
              "Pedir turno" — DNI+mail directo, muestra el turno activo
              como tarjeta si coincide. */}
          <MisTurnosButton slug={slug} />
        </section>

        {secciones.length > 0 && (
          <div className="@container mx-auto w-full max-w-3xl">
            <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-2">
              {secciones.map((s) => (
                <section key={s.id} id={s.id} className={`scroll-mt-6 ${s.ancho === "completo" ? "@2xl:col-span-2" : ""}`}>
                  {s.contenido}
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
