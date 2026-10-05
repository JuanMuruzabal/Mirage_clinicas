// El registro de plantillas: la única lista de documentos que existen.
//
// Puede haber varias VERSIONES de una misma plantilla: el texto legal de
// una versión no se edita nunca (un documento ya firmado guarda cuál leyó
// el paciente), así que un cambio es una versión nueva. Los documentos
// nuevos usan la última; los viejos se siguen leyendo con la suya.
import { plantillaSchema, type Plantilla, type TipoDePlantilla } from "./esquema";
import { anexoOdontopediatria } from "./plantillas/anexo-odontopediatria";
import { consentimientoBiopsia } from "./plantillas/consentimiento-biopsia";
import { consentimientoDiscapacidad } from "./plantillas/consentimiento-discapacidad";
import { consentimientoExtraccion } from "./plantillas/consentimiento-extraccion";
import { consentimientoImplantes } from "./plantillas/consentimiento-implantes";
import { consentimientoOdontopediatria } from "./plantillas/consentimiento-odontopediatria";
import { consentimientoOrtodoncia } from "./plantillas/consentimiento-ortodoncia";
import { consentimientoOrtopedia } from "./plantillas/consentimiento-ortopedia";
import { consentimientoPeriodoncia } from "./plantillas/consentimiento-periodoncia";
import { consentimientoProtesisCompleta } from "./plantillas/consentimiento-protesis-completa";
import { consentimientoProtesisFija } from "./plantillas/consentimiento-protesis-fija";
import { consentimientoProtesisRemovible } from "./plantillas/consentimiento-protesis-removible";
import { consentimientoSedoanalgesia } from "./plantillas/consentimiento-sedoanalgesia";
import { consentimientoTomaDeImagenes } from "./plantillas/consentimiento-toma-de-imagenes";
import { consentimientoTratamientoConducto } from "./plantillas/consentimiento-tratamiento-conducto";
import { consentimientoTratamientoConductoV2 } from "./plantillas/consentimiento-tratamiento-conducto-v2";
import { historiaClinicaGeneral } from "./plantillas/historia-clinica-general";
import { historiaClinicaGeneralV2 } from "./plantillas/historia-clinica-general-v2";
import { historiaClinicaPcd } from "./plantillas/historia-clinica-pcd";

// El orden es el del selector dentro de cada grupo (Fase 5.2): los
// consentimientos en el orden de la tabla de la fase (§2.2). El de
// COVID-19 queda afuera (D6): pide que se conteste "de puño y letra" y
// responde a un protocolo de 2020. Las historias clínicas, desde la 5.5, y
// los anexos, desde la 5.6b.
const DEFINICIONES: Plantilla[] = [
  consentimientoExtraccion,
  consentimientoTratamientoConducto,
  consentimientoBiopsia,
  consentimientoImplantes,
  consentimientoPeriodoncia,
  consentimientoProtesisCompleta,
  consentimientoProtesisFija,
  consentimientoProtesisRemovible,
  consentimientoOrtodoncia,
  consentimientoOrtopedia,
  consentimientoOdontopediatria,
  consentimientoDiscapacidad,
  consentimientoSedoanalgesia,
  consentimientoTomaDeImagenes,
  historiaClinicaGeneral,
  historiaClinicaPcd,
  anexoOdontopediatria,
  // Versiones anteriores: los documentos que las usaron se siguen leyendo
  // con la suya (TR-187). El selector ofrece la última.
  consentimientoTratamientoConductoV2,
  historiaClinicaGeneralV2,
];

/** Todas, validadas al importar: una plantilla rota no llega a la
 *  pantalla ni a la API (el generador corre sobre esta misma lista). */
export const PLANTILLAS: readonly Plantilla[] = DEFINICIONES.map((p) => plantillaSchema.parse(p));

export const ETIQUETA_DE_TIPO: Record<TipoDePlantilla, string> = {
  historia_clinica: "Historia clínica",
  anexo: "Anexo",
  consentimiento: "Consentimiento informado",
};

export function plantillaPorId(id: string, version?: number): Plantilla | undefined {
  const deEseId = PLANTILLAS.filter((p) => p.id === id);
  if (version !== undefined) return deEseId.find((p) => p.version === version);
  return deEseId.reduce<Plantilla | undefined>((ultima, p) => (!ultima || p.version > ultima.version ? p : ultima), undefined);
}

/** La última versión de cada plantilla, en el orden del registro: lo que
 *  ofrece el selector para empezar un documento nuevo. */
export function plantillasVigentes(): Plantilla[] {
  const vistas = new Set<string>();
  const vigentes: Plantilla[] = [];
  for (const p of PLANTILLAS) {
    if (vistas.has(p.id)) continue;
    vistas.add(p.id);
    const ultima = plantillaPorId(p.id);
    if (ultima) vigentes.push(ultima);
  }
  return vigentes;
}

/** Sin tildes ni mayúsculas: "extraccion" encuentra "Extracción". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** El buscador del selector: cada palabra tiene que aparecer en el nombre,
 *  el tipo o la descripción. */
export function buscarPlantillas(consulta: string, plantillas: readonly Plantilla[] = plantillasVigentes()): Plantilla[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [...plantillas];
  return plantillas.filter((p) => {
    const donde = normalizar(`${p.nombre} ${ETIQUETA_DE_TIPO[p.tipo]} ${p.descripcion}`);
    return palabras.every((w) => donde.includes(w));
  });
}
