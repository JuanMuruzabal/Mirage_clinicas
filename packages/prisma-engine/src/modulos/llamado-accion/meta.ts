import type { DefinicionModulo } from "../../tipos";
import { Editor } from "./editor";
import { seccion } from "./render";
import { SLOTS_LLAMADO } from "./variantes";

export const llamadoAccionModulo: DefinicionModulo = {
  tipo: "llamado_accion",
  nombre: "Llamado a la acción",
  descripcion: "Una banda con un mensaje breve y un botón de contacto.",
  repetible: false,
  configInicial: () => ({ texto: "", etiquetaBoton: "Pedí un turno", destino: "turno" }),
  ancho: () => "completo",
  variantes: [],
  opcionesDeSeccion: { titulo: true, fondo: true, alineacion: true },
  slotsAnimables: SLOTS_LLAMADO,
  Editor,
  seccion,
};
