// Historia clínica general, versión 2 (Fase 5.6a).
//
// Lo mismo que la versión 1, salvo el bloque del profesional: la firma y su
// aclaración lado a lado, debajo de la fila de firmas del paciente, cada una
// sobre un renglón de puntos como los del papel, en vez de la firma sola en
// el margen. Es una versión nueva porque la composición se congela con el
// documento (TR-187): los hechos con la 1 la siguen usando. El papel es el
// mismo.
//
// Se arma a partir de la 1 para que el resto sea idéntico por construcción.
import type { LugarDeFirma, Plantilla, Zona } from "../esquema";
import { historiaClinicaGeneral as v1 } from "./historia-clinica-general";

// La firma (232–388) y la aclaración (400–556), debajo de los rótulos del
// paciente (que terminan en 772) y hasta donde termina el renglón de su DNI.
// Cada lugar mide 156 × 32, y sus rótulos quedan en 818, por encima del pie
// de página del PDF (desde 823): sin escala, acá alcanza el margen. El
// renglón son 17 puntos suspensivos a 9,17 pt (155,89 pt, el ancho del
// lugar), el carácter de los renglones del papel.
const RENGLON_DEL_PROFESIONAL = "…".repeat(17);
const ZONAS_DEL_PROFESIONAL: Zona[] = [
  { id: "renglon_firma_profesional", pagina: 2, x: 232, y: 808, ancho: 156, tamano: 9.17, texto: RENGLON_DEL_PROFESIONAL },
  { id: "renglon_aclaracion_profesional", pagina: 2, x: 400, y: 808, ancho: 156, tamano: 9.17, texto: RENGLON_DEL_PROFESIONAL },
  // Como un hueco del papel: un punto adentro de cada lado y apenas arriba
  // del renglón.
  { id: "aclaracion_profesional", pagina: 2, x: 401, y: 806.8, ancho: 154, tamano: 9, alinear: "centro", texto: "{{odontologo}}" },
  { id: "rotulo_firma_profesional", pagina: 2, x: 232, y: 818, ancho: 156, tamano: 8, alinear: "centro", texto: "Firma del profesional" },
  { id: "rotulo_aclaracion_profesional", pagina: 2, x: 400, y: 818, ancho: 156, tamano: 8, alinear: "centro", texto: "Aclaración" },
];
const FIRMA_DEL_PROFESIONAL: LugarDeFirma = { rol: "profesional", pagina: 2, x: 232, y: 808, ancho: 156, alto: 32 };

export const historiaClinicaGeneralV2: Plantilla = {
  ...v1,
  version: 2,
  lamina: v1.lamina && {
    ...v1.lamina,
    zonas: [...v1.lamina.zonas.filter((z) => z.id !== "rotulo_firma_profesional"), ...ZONAS_DEL_PROFESIONAL],
    firmas: v1.lamina.firmas.map((f) => (f.rol === "profesional" ? FIRMA_DEL_PROFESIONAL : f)),
  },
};
