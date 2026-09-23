import type { BloqueMiniatura, DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_EQUIPO } from "./slots";
import { VARIANTES } from "./variantes";

const MINIATURAS: Record<(typeof VARIANTES)[number], BloqueMiniatura[]> = {
  foto: [[30, 8, 40, 6, "titulo"], [25, 20, 50, 32, "foto"], [34, 56, 32, 4, "texto"]],
  "foto-descripcion": [[30, 5, 40, 6, "titulo"], [5, 17, 28, 30, "tarjeta"], [36, 17, 28, 30, "tarjeta"], [67, 17, 28, 30, "tarjeta"]],
  "carrusel-nombre": [[30, 5, 40, 6, "titulo"], [4, 18, 27, 30, "tarjeta"], [36, 18, 27, 30, "tarjeta"], [68, 18, 27, 30, "tarjeta"]],
  "carrusel-sin-nombre": [[30, 5, 40, 6, "titulo"], [8, 20, 20, 20, "foto"], [40, 20, 20, 20, "foto"], [72, 20, 20, 20, "foto"]],
  avatares: [[30, 6, 40, 6, "titulo"], [13, 23, 18, 18, "foto"], [41, 23, 18, 18, "foto"], [69, 23, 18, 18, "foto"]],
  "tarjeta-volteable": [[30, 5, 40, 6, "titulo"], [13, 17, 34, 34, "tarjeta"], [53, 17, 34, 34, "tarjeta"]],
};

const NOMBRES_VARIANTE: Record<(typeof VARIANTES)[number], string> = {
  foto: "Foto",
  "foto-descripcion": "Foto y descripción",
  "carrusel-nombre": "Carrusel con nombre",
  "carrusel-sin-nombre": "Carrusel sin nombre",
  avatares: "Avatares en fila",
  "tarjeta-volteable": "Tarjeta interactiva",
};

export const equipoModulo: DefinicionModulo = {
  tipo: "equipo",
  nombre: "Equipo",
  descripcion: "Presentá a los profesionales que dieron su aval para aparecer en la página.",
  repetible: true,
  configInicial: () => ({ modo: "todos", userIds: [], mostrarNombre: true, mostrarDescripcion: true }),
  ancho: () => "completo",
  variantes: VARIANTES.map((id) => ({
    id,
    nombre: NOMBRES_VARIANTE[id],
    bloques: MINIATURAS[id],
  })),
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_EQUIPO,
  Editor,
  seccion,
};
