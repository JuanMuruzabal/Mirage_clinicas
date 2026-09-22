import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_CONTACTO } from "../../efectos/slots";

export const contactoModulo: DefinicionModulo = {
  tipo: "contacto",
  nombre: "Contacto",
  descripcion: "Dirección, mapa, teléfono y redes.",
  repetible: false,
  configInicial: () => ({}),
  ancho: () => "completo",
  variantes: [
    { id: "tarjeta", nombre: "Tarjeta", bloques: [[30, 6, 40, 6, "titulo"], [20, 18, 60, 4, "texto"], [15, 26, 70, 20, "foto"], [35, 50, 30, 4, "texto"]] },
    { id: "dividido", nombre: "Mapa y datos", bloques: [[5, 8, 45, 44, "foto"], [58, 12, 30, 6, "titulo"], [58, 24, 35, 4, "texto"], [58, 32, 30, 4, "texto"], [58, 42, 25, 6, "acento"]] },
  ],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_CONTACTO,
  Editor,
  seccion,
};
