import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_SERVICIOS } from "./slots";
import { VARIANTES } from "./variantes";

export const serviciosModulo: DefinicionModulo = {
  tipo: "servicios",
  nombre: "Servicios y tratamientos",
  descripcion: "Elegí qué servicios ofrecer y en qué orden aparecen.",
  repetible: false,
  configInicial: () => ({ nombres: [] }),
  ancho: () => "completo",
  variantes: [
    { id: "tarjetas", nombre: "Tarjetas", bloques: [[30, 5, 40, 6, "titulo"], [5, 18, 43, 28, "tarjeta"], [52, 18, 43, 28, "tarjeta"], [5, 50, 43, 8, "acento"], [52, 50, 43, 8, "acento"]] },
    { id: "lista", nombre: "Lista", bloques: [[30, 5, 40, 6, "titulo"], [8, 18, 84, 5, "texto"], [8, 30, 84, 5, "texto"], [8, 42, 84, 5, "texto"], [8, 54, 84, 5, "texto"]] },
    { id: "compacto", nombre: "Compacto", bloques: [[30, 5, 40, 6, "titulo"], [10, 20, 34, 8, "acento"], [54, 20, 34, 8, "acento"], [10, 38, 34, 8, "acento"], [54, 38, 34, 8, "acento"]] },
  ],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_SERVICIOS,
  Editor,
  seccion,
};
