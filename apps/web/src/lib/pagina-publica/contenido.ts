// ContenidoPagina — todo lo que la plantilla pública necesita para dibujar
// una página, sin importar de dónde venga: la respuesta de
// GET /clinicas/{slug} (la página real) o el borrador que el admin está
// armando en el editor (la previsualización). Un solo tipo para las dos
// fuentes es lo que mantiene "lo que ves es lo que se publica".
import type { ClinicaPublica } from "@dental-mirage/shared-types";
import { modulosParaMostrar, type ModuloBorrador } from "./modulos";

export interface ContenidoPagina {
  bio?: string | null;
  tema: string;
  temaVariante: string;
  temaTipografia: string;
  fotoPortadaUrl?: string | null;
  redesSociales: Record<string, string>;
  mostrarMapa: boolean;
  /** La dirección EFECTIVA (override o la de la clínica). */
  direccion?: string | null;
  /** El nombre de la clínica va sobre la foto de portada (si hay foto). */
  nombreSobrePortada: boolean;
  /** Id de un color de portada.ts; "" = el default. */
  nombreColor: string;
  /** Solo los que se muestran, ya en orden. */
  modulos: ModuloBorrador[];
  estadisticas: Record<string, number>;
}

export const CONTENIDO_VACIO: ContenidoPagina = {
  bio: null,
  tema: "",
  temaVariante: "",
  temaTipografia: "",
  fotoPortadaUrl: null,
  redesSociales: {},
  mostrarMapa: false,
  direccion: null,
  nombreSobrePortada: false,
  nombreColor: "",
  modulos: [],
  estadisticas: {},
};

export function contenidoDeClinicaPublica(clinica: ClinicaPublica): ContenidoPagina {
  return {
    bio: clinica.bio,
    tema: clinica.tema,
    temaVariante: clinica.temaVariante,
    temaTipografia: clinica.temaTipografia,
    fotoPortadaUrl: clinica.fotoPortadaUrl,
    redesSociales: clinica.redesSociales,
    mostrarMapa: clinica.mostrarMapa,
    direccion: clinica.direccion,
    nombreSobrePortada: clinica.nombreSobrePortada,
    nombreColor: clinica.nombreColor,
    modulos: modulosParaMostrar(clinica),
    estadisticas: clinica.estadisticas,
  };
}
