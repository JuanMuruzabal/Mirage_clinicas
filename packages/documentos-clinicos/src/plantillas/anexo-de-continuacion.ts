// Anexo de continuación (Fase 5.6d): la continuación de una sección de una
// historia clínica —el "Continúa en anexo Nº" del diagnóstico, del plan, de
// las observaciones o de los estudios—, como la hoja de evolución del papel.
//
// No se completa con el formulario: se crea desde su historia (POST
// /documentos/{id}/continuaciones), nace "abierto" y crece con ASIENTOS
// ("anotaciones" en la pantalla), cada uno con su fecha, su hora y su
// profesional, fijos una vez guardados (TR-182). No se firman dibujando: los
// firma el registro digital (la sesión, el nombre, el instante y el evento con
// la IP). La plantilla es lo que el registro necesita para nombrarlo y
// congelar su encabezado: el campo es el texto de una anotación. Los ids
// ("asiento") son internos y no cambian. No tiene lámina: su PDF lo arma la
// API con los asientos (internal/documentos/pdf_continuacion.go).
import type { Plantilla } from "../esquema";

export const anexoDeContinuacion: Plantilla = {
  id: "anexo-de-continuacion",
  version: 1,
  nombre: "Anexo de continuación",
  tipo: "anexo",
  descripcion: "La continuación de una sección de una historia clínica: anotaciones con fecha, hora y profesional, registradas digitalmente.",
  fuente: {
    nombre: "Colegio Odontológico de la Provincia de Córdoba",
    url: "https://colodontcba.org.ar/",
  },
  secciones: [
    {
      id: "asiento",
      titulo: "Anotación",
      campos: [{ tipo: "texto_largo", id: "asiento", etiqueta: "Anotación", requerido: true }],
    },
  ],
  cuerpo: [{ t: "titulo", texto: "Anexo de continuación" }, { t: "campo", campo: "asiento" }, { t: "firmas" }],
  firmas: [{ rol: "profesional", etiqueta: "Profesional que escribe la anotación", requerida: true }],
};
