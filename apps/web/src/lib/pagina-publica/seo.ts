// SEO de la página pública (PE-9, plan Prisma Engine): el título y la
// descripción que ven Google y la tarjeta de WhatsApp, y los datos
// estructurados (JSON-LD de schema.org). Funciones puras: las usan la página
// pública (`[slug]/page.tsx`) y el editor (la pestaña "Buscadores y redes",
// que muestra el default como sugerencia mientras el campo está vacío).
//
// El admin puede escribir su propio título y descripción; vacíos, se arman
// acá con el nombre, las especialidades y la ciudad. El default no se guarda
// en la base a propósito: así cambiar el nombre o sumar una especialidad se
// refleja solo.
import type { ClinicaPublica, HorariosClinica } from "@dental-mirage/shared-types";
import { esUrlDeFotoSegura, urlDeRedSocial } from "./enlaces";

/** Los largos de las columnas seo_titulo/seo_descripcion (y lo que un buscador muestra sin cortar). */
export const MAX_LARGO_SEO_TITULO = 70;
export const MAX_LARGO_SEO_DESCRIPCION = 160;

/** Una sola línea, sin espacios repetidos — lo mismo que guarda el backend (`textoSeo` en Go). */
export function textoSeo(texto: string): string {
  return texto.split(/\s+/).filter(Boolean).join(" ");
}

/** Corta en el último espacio antes del límite y agrega "…", nunca a mitad de palabra. */
export function recortar(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > maximo / 2 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:—-]+$/, "")}…`;
}

export interface DatosSeo {
  nombreClinica: string;
  especialidades: string[];
  ciudad?: string | null;
  bio?: string | null;
}

/** "Clínica Sol — Ortodoncia y Endodoncia en Córdoba". */
export function tituloSeoPorDefecto({ nombreClinica, especialidades, ciudad }: DatosSeo): string {
  const lugar = ciudad?.trim() ? ` en ${ciudad.trim()}` : "";
  const que = especialidades.length > 0 ? listaNatural(especialidades.slice(0, 2)) : "Turnos online";
  return recortar(textoSeo(`${nombreClinica} — ${que}${lugar}`), MAX_LARGO_SEO_TITULO);
}

/** El comienzo de la bio si hay; si no, una frase con lo que la clínica ofrece. */
export function descripcionSeoPorDefecto({ nombreClinica, especialidades, ciudad, bio }: DatosSeo): string {
  const texto = bio?.trim()
    ? bio
    : `Pedí turno online en ${nombreClinica}${especialidades.length > 0 ? `: ${listaNatural(especialidades)}` : ""}${
        ciudad?.trim() ? `, en ${ciudad.trim()}` : ""
      }.`;
  return recortar(textoSeo(texto), MAX_LARGO_SEO_DESCRIPCION);
}

/** El título y la descripción que rigen: los del admin, o los por defecto. */
export function seoDeClinica(clinica: Pick<ClinicaPublica, "nombreClinica" | "especialidades" | "ciudad" | "bio" | "seoTitulo" | "seoDescripcion">) {
  const datos: DatosSeo = clinica;
  return {
    titulo: textoSeo(clinica.seoTitulo ?? "") || tituloSeoPorDefecto(datos),
    descripcion: textoSeo(clinica.seoDescripcion ?? "") || descripcionSeoPorDefecto(datos),
  };
}

function listaNatural(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * El tipo de schema.org según las especialidades: `Dentist` si hay alguna de
 * odontología (es el rubro principal de PRISMA y gana aunque haya otras),
 * `Physiotherapy` para kinesiología, y `MedicalClinic` para el resto
 * (nutrición incluida: schema.org no tiene un tipo de comercio para eso).
 */
export function tipoSchemaOrg(especialidades: string[]): "Dentist" | "Physiotherapy" | "MedicalClinic" {
  const todas = especialidades.map(normalizar);
  if (todas.some((e) => /odont|ortodon|endodon|periodon|implant|dental/.test(e))) return "Dentist";
  if (todas.some((e) => /kinesi|fisiot|rehabilit/.test(e))) return "Physiotherapy";
  return "MedicalClinic";
}

const DIAS_SCHEMA_ORG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * `openingHoursSpecification` desde el horario del EDIFICIO (PE-6), no el de
 * las agendas: es cuándo está abierta la puerta. Sin ninguna franja cargada
 * no se declara nada — un horario vacío diría "cerrado siempre".
 */
export function horariosSchemaOrg(horarios: HorariosClinica | undefined) {
  if (!horarios) return undefined;
  const especificacion = horarios.dias.flatMap((dia) =>
    dia.cerrado
      ? []
      : dia.franjas.map((franja) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${DIAS_SCHEMA_ORG[dia.diaSemana]}`,
          opens: franja.desde,
          closes: franja.hasta,
        })),
  );
  return especificacion.length > 0 ? especificacion : undefined;
}

/**
 * El JSON-LD de la clínica. Solo lleva lo que la página ya muestra (nada de
 * datos de los profesionales, ni la matrícula): es un resumen para máquinas
 * de la misma vidriera. `urlPagina` y `urlSitio` son absolutas — un buscador
 * no resuelve rutas relativas acá adentro.
 */
export function jsonLdDeClinica(clinica: ClinicaPublica, urlPagina: string, urlSitio: string) {
  const { descripcion } = seoDeClinica(clinica);
  const telefono = clinica.telefonoClinica || clinica.telefono || undefined;
  const portada = clinica.fotoPortadaUrl && esUrlDeFotoSegura(clinica.fotoPortadaUrl) ? new URL(clinica.fotoPortadaUrl, urlSitio).toString() : undefined;
  const redes = Object.entries(clinica.redesSociales)
    .filter(([red]) => red !== "whatsapp")
    .map(([red, valor]) => urlDeRedSocial(red, valor))
    .filter((url): url is string => url !== null);

  return quitarVacios({
    "@context": "https://schema.org",
    "@type": tipoSchemaOrg(clinica.especialidades),
    name: clinica.nombreClinica,
    url: urlPagina,
    description: descripcion,
    telephone: telefono,
    image: portada ?? `${urlPagina}/opengraph-image`,
    address: clinica.direccion || clinica.ciudad
      ? quitarVacios({
          "@type": "PostalAddress",
          streetAddress: clinica.direccion ?? undefined,
          addressLocality: clinica.ciudad ?? undefined,
          addressRegion: clinica.provincia ?? undefined,
          addressCountry: "AR",
        })
      : undefined,
    sameAs: redes.length > 0 ? redes : undefined,
    openingHoursSpecification: horariosSchemaOrg(clinica.horariosClinica),
  });
}

function quitarVacios<T extends Record<string, unknown>>(objeto: T): Partial<T> {
  return Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<T>;
}

/**
 * Para meter el JSON-LD en un `<script>` del HTML: `<` escapado, o un texto
 * cargado por el admin con "</script>" cerraría la etiqueta (la guía de
 * JSON-LD de Next pide exactamente esto).
 */
export function serializarJsonLd(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, "\\u003c");
}
