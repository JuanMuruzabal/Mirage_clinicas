import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";

export const contactoModulo: DefinicionModulo = {
  tipo: "contacto",
  nombre: "Contacto",
  descripcion: "Dirección, mapa, teléfono y redes.",
  repetible: false,
  configInicial: () => ({}),
  ancho: () => "completo",
  Editor,
  seccion,
};
