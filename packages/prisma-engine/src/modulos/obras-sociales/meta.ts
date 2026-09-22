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
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_COBERTURAS,
  Editor,
  seccion,
};
