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
  miniatura: [[25, 6, 50, 6, "titulo"], [10, 18, 80, 8, "tarjeta"], [10, 30, 80, 8, "tarjeta"], [10, 42, 80, 8, "tarjeta"]],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_PREGUNTAS,
  Editor,
  seccion,
};
