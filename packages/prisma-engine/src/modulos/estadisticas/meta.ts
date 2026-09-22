import { ESTADISTICAS } from "../../constantes";
import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { VARIANTES } from "./variantes";
import { varianteDeConfig } from "../../lectura-config";

export const estadisticasModulo: DefinicionModulo = {
  tipo: "estadisticas",
  nombre: "Estadísticas",
  descripcion: "Números reales de tu clínica.",
  repetible: false,
  configInicial: () => ({ mostrar: ESTADISTICAS.map((e) => e.id) }),
  ancho: (config) => (varianteDeConfig(config, VARIANTES) === "franja" ? "completo" : "medio"),
  variantes: [
    { id: "tarjetas", nombre: "Tarjetas", bloques: [[5, 10, 43, 40, "tarjeta"], [52, 10, 43, 40, "tarjeta"], [15, 22, 23, 10, "acento"], [62, 22, 23, 10, "acento"]] },
    { id: "franja", nombre: "Franja", bloques: [[0, 15, 100, 30, "tarjeta"], [12, 22, 25, 12, "acento"], [62, 22, 25, 12, "acento"]] },
  ],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: false },
  Editor,
  seccion,
};
