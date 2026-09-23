import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_TEXTO, SLOTS_IMAGEN } from "../../efectos/slots";

export const sobreNosotros: DefinicionModulo = {
  tipo: "sobre_nosotros",
  nombre: "Sobre nosotros",
  descripcion: "Un texto institucional sobre la clínica.",
  repetible: false,
  configInicial: () => ({}),
  ancho: () => "completo",
  variantes: [
    { id: "centrado", nombre: "Centrado", bloques: [[30, 10, 40, 6, "titulo"], [15, 22, 70, 4, "texto"], [20, 30, 60, 4, "texto"], [25, 38, 50, 4, "texto"]] },
    { id: "con-foto", nombre: "Con foto al costado", bloques: [[5, 10, 42, 40, "foto"], [55, 14, 35, 6, "titulo"], [55, 26, 40, 4, "texto"], [55, 34, 40, 4, "texto"], [55, 42, 30, 4, "texto"]] },
    { id: "dos-columnas", nombre: "Dos columnas", bloques: [[30, 6, 40, 6, "titulo"], [5, 20, 42, 4, "texto"], [5, 28, 42, 4, "texto"], [5, 36, 42, 4, "texto"], [53, 20, 42, 4, "texto"], [53, 28, 42, 4, "texto"], [53, 36, 30, 4, "texto"]] },
  ],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: [...SLOTS_TEXTO, ...SLOTS_IMAGEN],
  Editor,
  seccion,
};
