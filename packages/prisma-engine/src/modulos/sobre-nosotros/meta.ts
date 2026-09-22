import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";

export const sobreNosotros: DefinicionModulo = {
  tipo: "sobre_nosotros",
  nombre: "Sobre nosotros",
  descripcion: "Un texto institucional sobre la clínica.",
  repetible: false,
  configInicial: () => ({}),
  ancho: () => "completo",
  Editor,
  seccion,
};
