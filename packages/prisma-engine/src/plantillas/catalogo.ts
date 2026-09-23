import odontologiaCalidoDinamico from "../../plantillas/odontologia-calido-dinamico.json";
import odontologiaClinicoSereno from "../../plantillas/odontologia-clinico-sereno.json";
import kinesiologiaCalidoDinamico from "../../plantillas/kinesiologia-calido-dinamico.json";
import kinesiologiaNaturalSereno from "../../plantillas/kinesiologia-natural-sereno.json";
import nutricionCalidoDinamico from "../../plantillas/nutricion-calido-dinamico.json";
import nutricionNaturalSereno from "../../plantillas/nutricion-natural-sereno.json";
import type { EstiloMovimiento } from "../efectos/catalogo";
import type { TokensTema } from "../tokens";

export type RubroPlantilla = "odontologia" | "kinesiologia" | "nutricion";
export type EstiloPlantilla = "clinico-sereno" | "calido-dinamico";

export interface ModuloPlantilla {
  tipo: string;
  visible: boolean;
  config: Record<string, unknown>;
}

/** Ruta semántica de un texto de ejemplo; nunca se persiste como flag en la página. */
export interface TextoEjemplo {
  ruta: string;
  valor: string;
  etiqueta: string;
}

/**
 * Datos completos de una plantilla. `estiloMovimiento` se mantiene separado
 * de `temaTokens` en el catálogo para que haya una sola declaración; al
 * aplicarse se copia a `temaTokens.movimiento`, que es donde vive en Borrador.
 */
export interface PlantillaPagina {
  schemaVersion: 1;
  id: string;
  nombre: string;
  rubro: RubroPlantilla;
  estilo: EstiloPlantilla;
  descripcion: string;
  tema: string;
  temaVariante: string;
  temaTipografia: string;
  temaTokens: TokensTema;
  estiloMovimiento: EstiloMovimiento;
  bio: string;
  fotoPortadaUrl: "";
  redes: Record<string, string>;
  mostrarMapa: boolean;
  direccionOverride: string;
  nombreSobrePortada: boolean;
  nombreColor: string;
  modulos: ModuloPlantilla[];
  textosEjemplo: TextoEjemplo[];
}

// Los JSON se validan contra temas, tokens y schemas de módulos en la
// integración de PE-7. Este límite mantiene el tipo del catálogo estable aun
// cuando TypeScript infiere sus imports JSON como valores amplios.
export const CATALOGO_PLANTILLAS: readonly PlantillaPagina[] = [
  odontologiaClinicoSereno as unknown as PlantillaPagina,
  odontologiaCalidoDinamico as unknown as PlantillaPagina,
  kinesiologiaNaturalSereno as unknown as PlantillaPagina,
  kinesiologiaCalidoDinamico as unknown as PlantillaPagina,
  nutricionNaturalSereno as unknown as PlantillaPagina,
  nutricionCalidoDinamico as unknown as PlantillaPagina,
];

export const PLANTILLAS_POR_ID: Readonly<Record<string, PlantillaPagina>> = Object.fromEntries(
  CATALOGO_PLANTILLAS.map((plantilla) => [plantilla.id, plantilla]),
);

export function plantillaPorId(id: string): PlantillaPagina | undefined {
  return PLANTILLAS_POR_ID[id];
}
