import type { EstiloMovimiento } from "../efectos/catalogo";
import type { TokensTema } from "../tokens";
import type { ModuloPlantilla } from "./catalogo";

export interface PresetEstilo {
  id: string;
  nombre: string;
  descripcion: string;
  tema: string;
  temaVariante: string;
  temaTipografia: string;
  temaTokens: TokensTema;
  estiloMovimiento: EstiloMovimiento;
}

export interface PresetSeccion {
  id: string;
  nombre: string;
  descripcion: string;
  modulo: ModuloPlantilla;
}

/** Cambian el lenguaje visual global, pero dejan intacto el contenido. */
export const CATALOGO_PRESETS_ESTILO: readonly PresetEstilo[] = [
  {
    id: "clinico-sereno",
    nombre: "Clínico sereno",
    descripcion: "Azules y teal, bordes suaves y movimiento leve.",
    tema: "clinico",
    temaVariante: "clinico-1",
    temaTipografia: "geometrica-moderna",
    temaTokens: {
      forma: "redonda",
      densidad: "comoda",
      superficie: "elevada",
      fondo: "degrade",
      boton: "redondeado",
      botonEstilo: "relleno",
      menu: "pastillas",
      portada: "centrada",
      fondoAnimado: "ninguno",
    },
    estiloMovimiento: "sereno",
  },
  {
    id: "calido-dinamico",
    nombre: "Cálido dinámico",
    descripcion: "Acentos cálidos, formas redondeadas y transiciones discretas.",
    tema: "calido",
    temaVariante: "calido-2",
    temaTipografia: "redondeada-calida",
    temaTokens: {
      forma: "redonda",
      densidad: "amplia",
      superficie: "elevada",
      fondo: "degrade",
      boton: "pastilla",
      botonEstilo: "relleno",
      menu: "subrayado",
      portada: "centrada",
      fondoAnimado: "degrade-respira",
    },
    estiloMovimiento: "dinamico",
  },
];

/** Secciones listas para agregar; los campos de texto quedan vacíos. */
export const CATALOGO_PRESETS_SECCION: readonly PresetSeccion[] = [
  {
    id: "servicios-tarjetas",
    nombre: "Servicios en tarjetas",
    descripcion: "Tarjetas de servicios que el administrador selecciona para su clínica.",
    modulo: {
      tipo: "servicios",
      visible: true,
      config: { nombres: [], variante: "tarjetas", fondoSeccion: "acento", alineacion: "centro" },
    },
  },
  {
    id: "servicios-lista",
    nombre: "Servicios en lista",
    descripcion: "Una lista compacta, ordenada según los servicios activos de la clínica.",
    modulo: {
      tipo: "servicios",
      visible: true,
      config: { nombres: [], variante: "lista", fondoSeccion: "normal", alineacion: "izquierda" },
    },
  },
  {
    id: "equipo-foto-descripcion",
    nombre: "Equipo con descripción",
    descripcion: "Presenta a las personas con aval vigente y sus descripciones.",
    modulo: {
      tipo: "equipo",
      visible: true,
      config: {
        modo: "todos",
        mostrarNombre: true,
        mostrarDescripcion: true,
        variante: "foto-descripcion",
        fondoSeccion: "normal",
        alineacion: "centro",
      },
    },
  },
  {
    id: "horarios-semanal",
    nombre: "Horario semanal",
    descripcion: "Muestra el horario del edificio en una tabla semanal.",
    modulo: {
      tipo: "horarios",
      visible: true,
      config: { variante: "semanal", fondoSeccion: "normal", alineacion: "centro" },
    },
  },
  {
    id: "preguntas-frecuentes",
    nombre: "Preguntas frecuentes",
    descripcion: "Agrega un acordeón vacío para escribir respuestas propias.",
    modulo: {
      tipo: "preguntas_frecuentes",
      visible: true,
      config: { preguntas: [], fondoSeccion: "acento", alineacion: "izquierda" },
    },
  },
  {
    id: "llamado-turnos",
    nombre: "Llamado a pedir turno",
    descripcion: "Un bloque de contacto con textos vacíos para completar.",
    modulo: {
      tipo: "llamado_accion",
      visible: true,
      config: { texto: "", etiquetaBoton: "", destino: "turno", fondoSeccion: "acento", alineacion: "centro" },
    },
  },
];

export function presetEstiloPorId(id: string): PresetEstilo | undefined {
  return CATALOGO_PRESETS_ESTILO.find((preset) => preset.id === id);
}

export function presetSeccionPorId(id: string): PresetSeccion | undefined {
  return CATALOGO_PRESETS_SECCION.find((preset) => preset.id === id);
}
