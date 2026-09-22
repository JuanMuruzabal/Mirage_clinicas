import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_TARJETA } from "../../efectos/slots";

export const especialidadesModulo: DefinicionModulo = {
  tipo: "especialidades",
  nombre: "Especialidades",
  descripcion: "Se arma sola con las de los profesionales.",
  repetible: false,
  configInicial: () => ({}),
  ancho: () => "medio",
  variantes: [
    { id: "chips", nombre: "Etiquetas", bloques: [[30, 8, 40, 6, "titulo"], [10, 24, 22, 7, "acento"], [36, 24, 26, 7, "acento"], [66, 24, 22, 7, "acento"], [22, 36, 26, 7, "acento"], [52, 36, 26, 7, "acento"]] },
    { id: "tarjetas", nombre: "Tarjetas", bloques: [[30, 4, 40, 6, "titulo"], [5, 16, 43, 16, "tarjeta"], [52, 16, 43, 16, "tarjeta"], [5, 36, 43, 16, "tarjeta"], [52, 36, 43, 16, "tarjeta"]] },
    { id: "lista", nombre: "Lista", bloques: [[30, 6, 40, 6, "titulo"], [10, 20, 80, 4, "texto"], [10, 30, 80, 4, "texto"], [10, 40, 80, 4, "texto"], [10, 50, 60, 4, "texto"]] },
  ],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_TARJETA,
  Editor,
  seccion,
};
