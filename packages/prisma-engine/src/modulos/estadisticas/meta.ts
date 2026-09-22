import { ESTADISTICAS } from "../../constantes";
import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";

export const estadisticasModulo: DefinicionModulo = {
  tipo: "estadisticas",
  nombre: "Estadísticas",
  descripcion: "Números reales de tu clínica.",
  repetible: false,
  configInicial: () => ({ mostrar: ESTADISTICAS.map((e) => e.id) }),
  ancho: () => "medio",
  Editor,
  seccion,
};
