import { Suspense, type CSSProperties, type ReactNode } from "react";
import type { TokensResueltos } from "@dental-mirage/prisma-engine";
import { QuadrantMark } from "@/components/quadrant-mark";
import { CONTENIDO_VACIO, type ContenidoPagina } from "@/lib/pagina-publica/contenido";
import { esUrlDeFotoSegura } from "@/lib/pagina-publica/enlaces";
import { modulosPorDefecto } from "@/lib/pagina-publica/modulos";
import { colorDeNombre, type ColorNombre } from "@/lib/pagina-publica/portada";
import { estiloDeTema } from "@/lib/temas-pagina-publica/aplicar";
import { EfectoSlot, srcsetDeFoto, TAMANOS_FOTO_POR_DEFECTO } from "@dental-mirage/prisma-engine";
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
  /**
   * La plantilla dibujada DENTRO del editor (vista previa, galería de
   * plantillas), no como página (PP-2, H5). Con esto los ids de las
   * secciones llevan un prefijo —dos vistas previas en el mismo documento
   * no repiten `#turno`— y el nombre de la clínica no es un `h1`: el de la
   * pantalla es "Tu página". Lo que se puede tocar lo neutraliza VistaPrevia.
   */
  vistaPrevia?: { prefijoIds: string };
}

// El menú según el token `menu` (PE-2). "pastillas" es el de siempre.
// "barra" es sticky: queda pegada arriba al hacer scroll (z-30, debajo de los
// modales del turno, que usan z-50).
const MENU: Record<TokensResueltos["menu"], { nav: string; link: string }> = {
  pastillas: {
    nav: "mx-auto flex w-full max-w-xl flex-wrap justify-center gap-2",
    link: "rounded-full border-[0.5px] border-(--pp-borde) bg-(--pp-superficie) px-4 py-1.5 text-xs font-medium text-(--pp-texto) hover:border-[var(--pp-acento,var(--color-salvia))] hover:text-[var(--pp-acento-texto,var(--color-salvia-oscuro))]",
  },
  subrayado: {
    nav: "mx-auto flex w-full max-w-xl flex-wrap justify-center gap-x-5 gap-y-2",
    link: "inline-flex min-h-6 items-center border-b-2 border-transparent pb-0.5 text-sm font-medium text-(--pp-texto) hover:border-[var(--pp-acento,var(--color-salvia))]",
  },
  barra: {
    nav: "sticky top-0 z-30 -mx-6 flex flex-wrap justify-center gap-x-5 gap-y-2 border-b-[0.5px] border-(--pp-borde) bg-(--pp-superficie) px-6 py-3",
    link: "inline-flex min-h-6 items-center text-sm font-medium text-(--pp-texto) hover:text-[var(--pp-acento-texto,var(--color-salvia-oscuro))]",

  },
};

/**
 * Opciones de sección (PE-3) sobre el <section>: fondo propio y alineación.
 * Con fondo, la sección se vuelve la caja — sus tarjetas se disuelven en ella
 * (sin superficie, borde, sombra ni relleno propios) para no dibujar una caja
 * dentro de otra. "contraste" invierte los colores: fondo del acento oscuro
 * (claro, en un tema oscuro) y el texto encima, que es lo que mide temas.test.ts.
 */
function opcionesDeSeccion(s: SeccionPublica): { className: string; style?: CSSProperties } {
  const vars: Record<string, string> = {};
  let className = "";
  if (s.alineacion === "izquierda") {
    vars["--pp-alinear"] = "left";
    vars["--pp-alinear-flex"] = "flex-start";
  }
  if (s.fondo === "acento" || s.fondo === "contraste") {
    className =
      s.fondo === "acento"
        ? "rounded-(--pp-radio) bg-[var(--pp-acento-suave,var(--color-salvia-claro))] p-(--pp-relleno)"
        : "rounded-(--pp-radio) bg-(--pp-contraste-fondo) p-(--pp-relleno)";
    Object.assign(vars, {
      "--pp-superficie": "transparent",
      "--pp-borde-ancho": "0px",
      "--pp-sombra": "0 0 #0000",
      "--pp-relleno-tarjeta": "0px",
    });
    if (s.fondo === "contraste") {
      Object.assign(vars, {
        "--pp-texto": "var(--pp-contraste-texto)",
        "--pp-acento-texto": "var(--pp-contraste-texto)",
        "--pp-acento-suave": "color-mix(in srgb, var(--pp-contraste-texto) 16%, transparent)",
        "--pp-borde": "color-mix(in srgb, var(--pp-contraste-texto) 30%, transparent)",
      });
    }
  }
  return { className, style: Object.keys(vars).length > 0 ? (vars as CSSProperties) : undefined };
}

interface PropsPortada {
  variante: TokensResueltos["portada"];
  foto: string | null;
  /** El alt de la foto: el que cargó el admin o, vacío, "Portada de <clínica>" (PP-4, H13). */
  altFoto: string;
  nombreClinica: string;
  profesionalNombre: string;
  /** Solo rige en la variante centrada (el nombre sobre la foto, TR-155). */
  nombreSobreFoto: boolean;
  colorNombre: ColorNombre;
  Tag: TagNombre;
}

const CLASE_NOMBRE = "font-[family-name:var(--font-display)] text-4xl font-medium text-(--pp-texto)";

/** El elemento del nombre de la clínica: `h1` en la página, `p` dentro del editor. */
type TagNombre = "h1" | "p";

function NombreYProfesional({ nombreClinica, profesionalNombre, Tag }: { nombreClinica: string; profesionalNombre: string; Tag: TagNombre }) {
  return (
    <>
      <QuadrantMark className="text-3xl text-[var(--pp-acento,var(--color-salvia))]" />
      <Tag className={CLASE_NOMBRE}>{nombreClinica}</Tag>
      <ProfesionalNombre nombre={profesionalNombre} />
    </>
  );
}

function ProfesionalNombre({ nombre }: { nombre: string }) {
  // grafito/80, no /60 (el tono que se usa sobre marfil/hueso en el resto
  // del producto) — sobre este fondo celeste, /60 da ~3.6:1, por debajo del
  // 4.5:1 de AA para texto normal (verificado a mano); /80 da ~6.25:1.
  // Desde PE-2 es el texto del tema al 80%.
  return <p className="text-sm text-(--pp-texto)/80">{nombre}</p>;
}

/**
 * La foto de portada (PE-9): con las variantes del backend en `srcset` y SIN
 * `loading="lazy"`, a diferencia de las fotos de los módulos — es lo primero
 * que se ve y casi siempre el elemento más grande de la pantalla (el LCP),
 * así que se pide con prioridad en vez de esperar al layout.
 */
function ImagenPortada({ src, alt, className, sizes = TAMANOS_FOTO_POR_DEFECTO }: { src: string; alt: string; className: string; sizes?: string }) {
  const srcSet = srcsetDeFoto(src);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} srcSet={srcSet} sizes={srcSet ? sizes : undefined} alt={alt} fetchPriority="high" decoding="async" className={className} />;
}

/**
 * La portada según su variante (PE-3). Las que necesitan foto ("dividida",
 * "fondo") se dibujan centradas si no hay: una variante nunca deja un hueco.
 * "dividida" lleva su propio `@container`: la portada no tiene modales
 * adentro, así que no aplica la restricción de TR-151 (ver más abajo), y así
 * la vista previa del editor la parte en dos según su ancho, no el de la
 * ventana.
 */
function Portada({ variante, foto, altFoto, nombreClinica, profesionalNombre, nombreSobreFoto, colorNombre, Tag }: PropsPortada): ReactNode {

  if (variante === "minima") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 text-center">
        <NombreYProfesional nombreClinica={nombreClinica} profesionalNombre={profesionalNombre} Tag={Tag} />
      </div>
    );
  }
  if (variante === "dividida" && foto) {
    return (
      <div className="@container mx-auto w-full max-w-3xl">
        <div className="grid grid-cols-1 items-center gap-6 @xl:grid-cols-2">
          <ImagenPortada src={foto} alt={altFoto} sizes="(min-width: 48rem) 24rem, 100vw" className="aspect-[4/3] w-full rounded-(--pp-radio) object-cover" />
          <div className="flex flex-col items-center gap-3 text-center @xl:items-start @xl:text-left">
            <NombreYProfesional nombreClinica={nombreClinica} profesionalNombre={profesionalNombre} Tag={Tag} />
          </div>
        </div>
      </div>
    );
  }
  if (variante === "fondo" && foto) {
    // La foto ocupa toda la portada y el nombre va encima, siempre: el velo
    // y el color son los mismos que el "nombre sobre la foto" de la
    // variante centrada (portada.ts), más cargados porque cubren todo.
    return (
      <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-(--pp-radio)">
        <ImagenPortada src={foto} alt={altFoto} className="absolute inset-0 h-full w-full object-cover" />
        <div
          aria-hidden="true"
          className={`absolute inset-0 ${
            colorNombre.velo === "claro"
              ? "bg-gradient-to-t from-white/85 via-white/45 to-white/10"
              : "bg-gradient-to-t from-black/75 via-black/40 to-black/10"
          }`}
        />
        <div
          className="relative flex min-h-[20rem] flex-col items-center justify-end gap-2 px-6 pb-8 text-center"
          style={{ color: colorNombre.hex }}
        >
          <Tag className="break-words font-[family-name:var(--font-display)] text-4xl font-medium">{nombreClinica}</Tag>
          <p className="text-sm opacity-90">{profesionalNombre}</p>
        </div>
      </div>
    );
  }
  // "centrada" — la de siempre (Fase 4.4/4.5), y la que usan "dividida" y
  // "fondo" cuando no hay foto.
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 text-center">
      {foto && (
        <div className="relative mb-3 w-full overflow-hidden rounded-(--pp-radio)">
          <ImagenPortada src={foto} alt={altFoto} className="aspect-[16/7] w-full object-cover" />
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
              <Tag
                className="absolute inset-x-0 bottom-0 break-words px-6 pb-5 text-center font-[family-name:var(--font-display)] text-3xl font-medium"
                style={{
                  color: colorNombre.hex,
                  textShadow: colorNombre.velo === "claro" ? "0 1px 6px rgba(255,255,255,0.6)" : "0 1px 8px rgba(0,0,0,0.45)",
                }}
              >
                {nombreClinica}
              </Tag>
            </>
          )}
        </div>
      )}
      {nombreSobreFoto ? (
        <ProfesionalNombre nombre={profesionalNombre} />
      ) : (
        <NombreYProfesional nombreClinica={nombreClinica} profesionalNombre={profesionalNombre} Tag={Tag} />
      )}
    </div>
  );
}

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
  vistaPrevia,
}: ClinicaPublicaTemplateProps) {
  const prefijo = vistaPrevia?.prefijoIds ?? "";
  const c = contenido ?? { ...CONTENIDO_VACIO, modulos: modulosPorDefecto() };
  const tema = estiloDeTema(c.tema, c.temaVariante, c.temaTipografia, c.temaTokens);
  const portada = c.fotoPortadaUrl && esUrlDeFotoSegura(c.fotoPortadaUrl) ? c.fotoPortadaUrl : null;
  // El nombre sobre la foto solo tiene sentido CON foto: sin ella no hay
  // dónde ponerlo y se dibuja debajo, como siempre — la opción no rompe una
  // página a la que después le sacan la portada.
  const nombreSobreFoto = portada !== null && c.nombreSobrePortada;
  const colorNombre = colorDeNombre(c.nombreColor);
  const menu = MENU[tema.tokens.menu];
  // Con la barra sticky, un link del menú dejaba el título de la sección
  // DEBAJO de la barra (PP-1, H16): el margen de scroll tiene que cubrir su
  // alto, que puede ser de dos filas en un celular.
  const margenDeScroll = tema.tokens.menu === "barra" ? "scroll-mt-28" : "scroll-mt-6";

  const secciones = c.modulos
    .map((m, i) => seccionDeModulo(m, i, { slug, nombreClinica, telefono, especialidades, contenido: c, estiloMovimiento: tema.tokens.movimiento }))
    .filter((s): s is SeccionPublica => s !== null);
  const linksDelMenu = secciones.filter((s) => s.etiqueta !== null);

  return (
    // pp-raiz: los defaults de los tokens de diseño (globals.css, PE-2). El
    // style del tema los pisa en este MISMO elemento — ver el comentario de
    // `.pp-raiz` sobre por qué tiene que ser el mismo.
    <div className={`pp-raiz ${tema.className}`} style={tema.style} data-pp-movimiento={tema.tokens.movimiento}>
      <EfectoSlot id={tema.tokens.fondoAnimado === "ninguno" ? undefined : tema.tokens.fondoAnimado} intensidad="media">
      <div className="pp-fondo-vivo__base flex flex-col gap-(--pp-espacio-pagina) bg-[var(--pp-fondo,#e7f2f7)] [background-image:var(--pp-fondo-imagen)] [background-size:var(--pp-fondo-tamano)] px-6 py-16">
        <Portada
          variante={tema.tokens.portada}
          foto={portada}
          altFoto={c.fotoPortadaAlt?.trim() || `Portada de ${nombreClinica}`}
          nombreClinica={nombreClinica}
          profesionalNombre={profesionalNombre}
          nombreSobreFoto={nombreSobreFoto}
          colorNombre={colorNombre}
          Tag={vistaPrevia ? "p" : "h1"}
        />

        <nav aria-label="Ir a una sección de esta página" className={menu.nav}>
          <a href={`#${prefijo}turno`} className={menu.link}>
            Pedí tu turno
          </a>
          {linksDelMenu.map((s) => (
            <a key={s.id} href={`#${prefijo}${s.id}`} className={menu.link}>
              {s.etiqueta}
            </a>
          ))}
        </nav>

        {/* Fase 2.4.1 (corrección de QA sobre F4.1.6): esta sección ya no
            embebe el wizard directo — es solo el botón que lo abre por
            encima de la página (ver PedirTurnoButton). */}
        <section id={`${prefijo}turno`} className={`mx-auto flex w-full max-w-xl ${margenDeScroll} flex-col items-center gap-4 text-center`}>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-(--pp-texto)">Pedí tu turno</h2>
          <p className="text-sm text-(--pp-texto)/70">Elegí el horario que más te convenga en simples pasos.</p>
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
            <div className="grid grid-cols-1 gap-(--pp-espacio) @2xl:grid-cols-2">
              {secciones.map((s) => {
                const opciones = opcionesDeSeccion(s);
                return (
                  <section
                    key={s.id}
                    id={`${prefijo}${s.id}`}

                    style={opciones.style}
                    className={`${margenDeScroll} ${s.ancho
 === "completo" ? "@2xl:col-span-2" : ""} ${opciones.className}`}
                  >
                    {s.contenido}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </EfectoSlot>
    </div>
  );
}
