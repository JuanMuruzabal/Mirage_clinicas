import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";

export const especialidadesModulo: DefinicionModulo = {
  tipo: "especialidades",
  nombre: "Especialidades",
  descripcion: "Se arma sola con las de los profesionales.",
  repetible: false,
  configInicial: () => ({}),
  ancho: () => "medio",
  Editor,
  seccion,
};
