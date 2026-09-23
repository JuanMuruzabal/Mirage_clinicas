import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_PREGUNTAS } from "./variantes";

export const preguntasFrecuentesModulo: DefinicionModulo = {
  tipo: "preguntas_frecuentes",
  nombre: "Preguntas frecuentes",
  descripcion: "Respuestas breves a las consultas más habituales.",
  repetible: false,
  configInicial: () => ({ preguntas: [] }),
  ancho: () => "completo",
  variantes: [],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_PREGUNTAS,
  Editor,
  seccion,
};
