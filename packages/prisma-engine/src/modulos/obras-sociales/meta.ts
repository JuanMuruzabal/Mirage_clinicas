import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_COBERTURAS } from "./variantes";

export const obrasSocialesModulo: DefinicionModulo = {
  tipo: "obras_sociales",
  nombre: "Obras sociales y prepagas",
  descripcion: "Elegí coberturas de un catálogo curado y habilitá consultas por otras.",
  repetible: false,
  configInicial: () => ({ coberturas: [], consultaPorOtras: false }),
  ancho: () => "completo",
  variantes: [],
  miniatura: [[25, 6, 50, 6, "titulo"], [8, 20, 25, 8, "tarjeta"], [37, 20, 25, 8, "tarjeta"], [66, 20, 25, 8, "tarjeta"], [8, 34, 25, 8, "tarjeta"], [37, 34, 25, 8, "tarjeta"]],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_COBERTURAS,
  Editor,
  seccion,
};
