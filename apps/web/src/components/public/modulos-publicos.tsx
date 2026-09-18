import type { ReactNode } from "react";
import type { ContenidoPagina } from "@/lib/pagina-publica/contenido";
import { esUrlDeFotoSegura, hrefDeTelefono, urlDeComoLlegar, urlDeMapaEmbebido, urlDeRedSocial } from "@/lib/pagina-publica/enlaces";
import {
  ESTADISTICAS,
  REDES_SOCIALES,
  anchoDeModulo,
  listaDeConfig,
  subtipoDeConfig,
  textoDeConfig,
  type ModuloBorrador,
} from "@/lib/pagina-publica/modulos";

// Los módulos opcionales de la página pública (Fase 4.5). Cada uno
// devuelve `null` cuando no tiene nada que mostrar — un "Sobre nosotros"
// sin texto o una galería sin fotos no dejan un hueco ni un título suelto,
// y tampoco un link en el menú de la página (el menú sale de lo que SÍ se
// dibujó, ver ClinicaPublicaTemplate).

export interface SeccionPublica {
  /** Ancla (#id) — también la usa el menú de la página. */
  id: string;
  /** Texto del link del menú, o null si la sección no lleva. */
  etiqueta: string | null;
  ancho: "completo" | "medio";
  /** Sin el `<section>` ni el ancho: eso lo pone la plantilla. */
  contenido: ReactNode;
}

interface Contexto {
  nombreClinica: string;
  telefono?: string | null;
  especialidades: string[];
  contenido: ContenidoPagina;
}

const CLASE_TARJETA = "rounded-card border-[0.5px] border-arena bg-marfil p-6";
const CLASE_TITULO = "font-[family-name:var(--font-display)] text-xl font-medium text-grafito";

function Titulo({ children }: { children: ReactNode }) {
  return <h2 className={CLASE_TITULO}>{children}</h2>;
}

// Un <img> plano y no next/image: las fotos vienen de un storage externo
// (disco en dev, R2 en producción) y next/image exigiría declarar cada host
// en next.config — un acoplamiento que no aporta nada acá, las fotos ya se
// suben acotadas (5 MB, jpeg/png/webp) por el backend.
function Foto({ src, alt, className }: { src: string; alt: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}

function SobreNosotros({ bio }: { bio?: string | null }): ReactNode {
  const texto = bio?.trim();
  if (!texto) return null;
  return (
    <div className={`${CLASE_TARJETA} text-center`}>
      <Titulo>Sobre nosotros</Titulo>
      <p className="mt-2 whitespace-pre-line text-sm text-grafito/80">{texto}</p>
    </div>
  );
}

function TextoLibre({ config }: { config: Record<string, unknown> }): ReactNode {
  const titulo = textoDeConfig(config, "titulo").trim();
  const texto = textoDeConfig(config, "texto").trim();
  if (!titulo && !texto) return null;
  return (
    <div className={`${CLASE_TARJETA} text-center`}>
      {titulo && <Titulo>{titulo}</Titulo>}
      {texto && <p className={`${titulo ? "mt-2 " : ""}whitespace-pre-line text-sm text-grafito/80`}>{texto}</p>}
    </div>
  );
}

function Especialidades({ especialidades }: { especialidades: string[] }): ReactNode {
  if (especialidades.length === 0) return null;
  return (
    <div className="text-center">
      <h2 className={`mb-3 ${CLASE_TITULO}`}>Especialidades</h2>
      <div className="flex flex-wrap justify-center gap-2">
        {especialidades.map((esp) => (
          <span
            key={esp}
            className="rounded-full border-[0.5px] border-arena bg-[var(--pp-acento-suave,var(--color-marfil))] px-2.5 py-1 text-xs text-[var(--pp-acento-texto,var(--color-grafito))]"
          >
            {esp}
          </span>
        ))}
      </div>
    </div>
  );
}

function FotoSuelta({ config, nombreClinica }: { config: Record<string, unknown>; nombreClinica: string }): ReactNode {
  const url = textoDeConfig(config, "fotoUrl");
  if (!url || !esUrlDeFotoSegura(url)) return null;
  const subtipo = subtipoDeConfig(config);
  const clase =
    subtipo === "retrato"
      ? "mx-auto aspect-[3/4] w-full max-w-xs rounded-card object-cover"
      : subtipo === "franja"
        ? "aspect-[21/6] w-full rounded-card object-cover"
        : "aspect-[16/7] w-full rounded-card object-cover";
  return <Foto src={url} alt={`Foto de ${nombreClinica}`} className={clase} />;
}

function Galeria({ config, nombreClinica }: { config: Record<string, unknown>; nombreClinica: string }): ReactNode {
  const fotos = listaDeConfig(config, "fotoUrls").filter(esUrlDeFotoSegura);
  if (fotos.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3">
      {fotos.map((url, i) => (
        <Foto key={`${url}-${i}`} src={url} alt={`Foto ${i + 1} de ${nombreClinica}`} className="aspect-square w-full rounded-card object-cover" />
      ))}
    </div>
  );
}

function Estadisticas({ config, estadisticas }: { config: Record<string, unknown>; estadisticas: Record<string, number> }): ReactNode {
  const elegidas = ESTADISTICAS.filter((e) => listaDeConfig(config, "mostrar").includes(e.id));
  if (elegidas.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {elegidas.map((e) => (
        <div key={e.id} className={`${CLASE_TARJETA} flex flex-col items-center justify-center gap-1 !p-4 text-center`}>
          <span className="font-[family-name:var(--font-display)] text-3xl font-medium text-[var(--pp-acento-texto,var(--color-grafito))]">
            {estadisticas[e.id] ?? 0}
          </span>
          <span className="text-xs text-grafito/70">{e.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

function Contacto({ contexto }: { contexto: Contexto }): ReactNode {
  const { contenido, telefono } = contexto;
  const direccion = contenido.direccion?.trim() || null;
  const hrefTel = telefono ? hrefDeTelefono(telefono) : null;
  const redes = REDES_SOCIALES.map((r) => ({ ...r, href: urlDeRedSocial(r.id, contenido.redesSociales[r.id] ?? "") })).filter(
    (r): r is typeof r & { href: string } => r.href !== null,
  );
  if (!direccion && !hrefTel && redes.length === 0) return null;

  return (
    <div className={`${CLASE_TARJETA} flex flex-col gap-4 text-center`}>
      <Titulo>Contacto</Titulo>
      {direccion && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-grafito/80">{direccion}</p>
          {contenido.mostrarMapa && (
            <iframe
              title={`Mapa: ${direccion}`}
              src={urlDeMapaEmbebido(direccion)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="aspect-[16/10] w-full rounded-field border-[0.5px] border-arena"
            />
          )}
          <a
            href={urlDeComoLlegar(direccion)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-[var(--pp-acento-texto,var(--color-salvia-oscuro))] underline underline-offset-2"
          >
            Cómo llegar
          </a>
        </div>
      )}
      {hrefTel && (
        <p className="text-sm text-grafito/80">
          Teléfono:{" "}
          <a href={hrefTel} className="font-medium text-[var(--pp-acento-texto,var(--color-salvia-oscuro))] underline underline-offset-2">
            {telefono}
          </a>
        </p>
      )}
      {redes.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2">
          {redes.map((r) => (
            <li key={r.id}>
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border-[0.5px] border-arena bg-[var(--pp-acento-suave,var(--color-marfil))] px-3 py-1.5 text-xs font-medium text-[var(--pp-acento-texto,var(--color-grafito))] hover:border-[var(--pp-acento,var(--color-salvia))]"
              >
                {r.etiqueta}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Arma la sección pública de UN módulo, o `null` si no hay nada que
 * mostrar. `indice` es la posición dentro de la lista (para dar ancla propia
 * a los módulos que pueden repetirse).
 *
 * Los componentes de arriba se LLAMAN como funciones (`SobreNosotros({...})`)
 * en vez de montarse como `<SobreNosotros />` a propósito: hace falta saber
 * si devuelven `null` ANTES de armar la sección y el menú, y un elemento de
 * React no deja ver eso. Es válido porque ninguno usa hooks.
 */
export function seccionDeModulo(modulo: ModuloBorrador, indice: number, contexto: Contexto): SeccionPublica | null {
  const { contenido, nombreClinica, especialidades } = contexto;
  const ancho = anchoDeModulo(modulo.tipo, modulo.config);
  const armar = (id: string, etiqueta: string | null, nodo: ReactNode): SeccionPublica | null =>
    nodo === null ? null : { id, etiqueta, ancho, contenido: nodo };

  switch (modulo.tipo) {
    case "sobre_nosotros":
      return armar("sobre-nosotros", "Sobre nosotros", SobreNosotros({ bio: contenido.bio }));
    case "texto_libre": {
      const titulo = textoDeConfig(modulo.config, "titulo").trim();
      return armar(`texto-${indice}`, titulo || null, TextoLibre({ config: modulo.config }));
    }
    case "especialidades":
      return armar("especialidades", "Especialidades", Especialidades({ especialidades }));
    case "foto":
      return armar(`foto-${indice}`, null, FotoSuelta({ config: modulo.config, nombreClinica }));
    case "galeria":
      return armar("galeria", "Galería", Galeria({ config: modulo.config, nombreClinica }));
    case "estadisticas":
      return armar("estadisticas", null, Estadisticas({ config: modulo.config, estadisticas: contenido.estadisticas }));
    case "contacto":
      return armar("contacto", "Contacto", Contacto({ contexto }));
    default:
      // Un tipo que este frontend no conoce (p. ej. "horarios", que el
      // backend acepta pero todavía no se dibuja) se ignora en vez de
      // romper la página.
      return null;
  }
}
