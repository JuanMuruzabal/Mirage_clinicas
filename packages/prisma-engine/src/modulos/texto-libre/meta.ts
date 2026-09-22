import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";

export const textoLibre: DefinicionModulo = {
  tipo: "texto_libre",
  nombre: "Texto libre",
  descripcion: "Una sección de texto con título propio.",
  repetible: true,
  configInicial: () => ({ titulo: "", texto: "" }),
  ancho: () => "completo",
  Editor,
  seccion,
};
