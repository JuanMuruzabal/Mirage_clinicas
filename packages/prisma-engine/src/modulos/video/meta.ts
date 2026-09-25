import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_VIDEO } from "./variantes";

export const videoModulo: DefinicionModulo = {
  tipo: "video",
  nombre: "Video",
  descripcion: "Insertá un video público de YouTube o Vimeo.",
  repetible: false,
  configInicial: () => ({ url: "" }),
  ancho: () => "completo",
  variantes: [],
  miniatura: [[10, 6, 80, 48, "foto"], [44, 24, 12, 12, "acento"]],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_VIDEO,
  Editor,
  seccion,
};
