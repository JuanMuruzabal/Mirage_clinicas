import type { DefinicionModulo } from "../../tipos";
import { subtipoDeConfig } from "../../lectura-config";
import { Editor } from "./editor";
import { seccion } from "./render";

export const fotoModulo: DefinicionModulo = {
  tipo: "foto",
  nombre: "Foto",
  descripcion: "Una imagen destacada.",
  repetible: true,
  configInicial: () => ({ fotoUrl: "", subtipo: "banner" }),
  ancho: (config) => (subtipoDeConfig(config) === "retrato" ? "medio" : "completo"),
  Editor,
  seccion,
};
