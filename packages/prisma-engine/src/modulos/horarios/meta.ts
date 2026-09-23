import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_HORARIOS } from "./slots";
import { VARIANTES } from "./variantes";

export const horariosModulo: DefinicionModulo = {
  tipo: "horarios",
  nombre: "Horarios del consultorio",
  descripcion: "Mostrá cuándo está abierto el edificio, independientemente de las agendas profesionales.",
  repetible: false,
  configInicial: () => ({}),
  ancho: (config) => (config.variante === "contacto" ? "medio" : "completo"),
  variantes: [
    { id: "semanal", nombre: "Tabla semanal", bloques: [[30, 5, 40, 6, "titulo"], [8, 17, 84, 6, "texto"], [8, 28, 84, 6, "texto"], [8, 39, 84, 6, "texto"], [8, 50, 84, 6, "texto"]] },
    { id: "compacto", nombre: "Lista compacta", bloques: [[30, 5, 40, 6, "titulo"], [15, 18, 70, 5, "texto"], [15, 29, 70, 5, "texto"], [15, 40, 70, 5, "texto"], [15, 51, 70, 5, "texto"]] },
    { id: "contacto", nombre: "Tarjeta junto a Contacto", bloques: [[30, 5, 40, 6, "titulo"], [14, 20, 72, 6, "tarjeta"], [14, 34, 72, 6, "tarjeta"], [14, 48, 72, 6, "tarjeta"]] },
    { id: "abierto-ahora", nombre: "Estado actual", bloques: [[30, 5, 40, 6, "titulo"], [24, 19, 52, 10, "acento"], [15, 39, 70, 5, "texto"], [15, 50, 70, 5, "texto"]] },
  ],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_HORARIOS,
  Editor,
  seccion,
};
