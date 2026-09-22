import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";

export const galeriaModulo: DefinicionModulo = {
  tipo: "galeria",
  nombre: "Galería",
  descripcion: "Varias fotos juntas.",
  repetible: false,
  configInicial: () => ({ fotoUrls: [] }),
  ancho: () => "completo",
  Editor,
  seccion,
};
