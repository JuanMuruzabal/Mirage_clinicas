import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_GALERIA } from "../../efectos/slots";

export const galeriaModulo: DefinicionModulo = {
  tipo: "galeria",
  nombre: "Galería",
  descripcion: "Varias fotos juntas.",
  repetible: false,
  configInicial: () => ({ fotoUrls: [] }),
  ancho: () => "completo",
  variantes: [
    { id: "grilla", nombre: "Grilla", bloques: [[5, 5, 28, 24, "foto"], [36, 5, 28, 24, "foto"], [67, 5, 28, 24, "foto"], [5, 32, 28, 24, "foto"], [36, 32, 28, 24, "foto"], [67, 32, 28, 24, "foto"]] },
    { id: "mosaico", nombre: "Mosaico", bloques: [[5, 5, 28, 30, "foto"], [5, 38, 28, 18, "foto"], [36, 5, 28, 18, "foto"], [36, 26, 28, 30, "foto"], [67, 5, 28, 24, "foto"], [67, 32, 28, 24, "foto"]] },
    { id: "carrusel", nombre: "Carrusel", bloques: [[0, 10, 30, 40, "foto"], [35, 10, 55, 40, "foto"], [95, 10, 5, 40, "foto"]] },
  ],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: false },
  slotsAnimables: SLOTS_GALERIA,
  Editor,
  seccion,
};
