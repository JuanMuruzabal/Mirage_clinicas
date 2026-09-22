import type { DefinicionModulo } from "../../tipos";
import { subtipoDeConfig } from "../../lectura-config";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_FOTO } from "../../efectos/slots";

export const fotoModulo: DefinicionModulo = {
  tipo: "foto",
  nombre: "Foto",
  descripcion: "Una imagen destacada.",
  repetible: true,
  configInicial: () => ({ fotoUrl: "", subtipo: "banner" }),
  ancho: (config) => (subtipoDeConfig(config) === "retrato" ? "medio" : "completo"),
  variantes: [],
  opcionesDeSeccion: { titulo: false, fondo: false, alineacion: false },
  slotsAnimables: SLOTS_FOTO,
  Editor,
  seccion,
};
