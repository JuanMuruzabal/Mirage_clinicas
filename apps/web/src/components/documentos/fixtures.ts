// Datos de prueba de los tests de documentos clínicos (Fase 5.1).
import type { DocumentoDetalle, FirmaDeDocumento, TrazoDeFirma } from "@dental-mirage/shared-types";
import { armarCuerpo, armarLamina, plantillaPorId, plantillaSchema, type Plantilla } from "@dental-mirage/documentos-clinicos";

// La versión 1: los documentos de estos tests son de esa versión (plantillaVersion: 1),
// la que todavía pedía los datos de quien suscribe (la 2 los deja a mano, Fase 5.2).
export const conducto = plantillaPorId("consentimiento-tratamiento-conducto", 1) as Plantilla;

/** Una plantilla chica con todos los tipos de campo. */
export const todoTipo: Plantilla = plantillaSchema.parse({
  id: "prueba-todo-tipo",
  version: 1,
  nombre: "Prueba de campos",
  tipo: "historia_clinica",
  descripcion: "Todos los tipos de campo.",
  fuente: { nombre: "Tests", url: "https://example.com/modelo" },
  secciones: [
    {
      id: "datos",
      titulo: "Datos",
      campos: [
        { tipo: "texto", id: "nombre", etiqueta: "Nombre", requerido: true, ayuda: "Como figura en el DNI." },
        { tipo: "texto", id: "profesional", etiqueta: "Profesional", bloqueado: true },
        { tipo: "texto_largo", id: "notas", etiqueta: "Notas" },
        { tipo: "fecha", id: "dia", etiqueta: "Día" },
        { tipo: "hora", id: "hora", etiqueta: "Hora" },
        { tipo: "numero", id: "peso", etiqueta: "Peso", unidad: "kg", decimales: 1 },
      ],
    },
    {
      id: "clinica",
      titulo: "Clínica",
      campos: [
        { tipo: "si_no", id: "alergia", etiqueta: "¿Alergia?", detalle: { etiqueta: "¿A qué?", cuando: "si" } },
        {
          tipo: "opcion_unica",
          id: "higiene",
          etiqueta: "Higiene",
          opciones: [
            { valor: "buena", etiqueta: "Buena" },
            { valor: "mala", etiqueta: "Mala" },
          ],
        },
        {
          tipo: "opcion_multiple",
          id: "habitos",
          etiqueta: "Hábitos",
          opciones: [
            { valor: "dedo", etiqueta: "Dedo" },
            { valor: "lengua", etiqueta: "Lengua" },
          ],
        },
        { tipo: "piezas", id: "piezas", etiqueta: "Piezas", denticion: "ambas" },
      ],
    },
  ],
  cuerpo: [
    { t: "titulo", texto: "Prueba" },
    { t: "subtitulo", texto: "De campos" },
    { t: "parrafo", texto: "{{nombre}} ({{profesional}}), el {{sistema.fecha}} a las {{hora}} del {{dia}}, {{peso}}." },
    { t: "lista", items: ["{{alergia}}", "{{higiene}}", "{{habitos}}", "{{piezas}}"] },
    { t: "campo", campo: "notas" },
    { t: "firmas" },
  ],
  firmas: [
    { rol: "paciente", etiqueta: "Firma del paciente", requerida: true },
    { rol: "profesional", etiqueta: "Firma del profesional", requerida: true },
  ],
});

export function trazo(): TrazoDeFirma {
  return {
    ancho: 300,
    alto: 150,
    trazos: [
      [
        [10, 10, 0],
        [40, 30, 16],
        [80, 20, 32],
      ],
    ],
  };
}

export function firma(rol: string, extra: Partial<FirmaDeDocumento> = {}): FirmaDeDocumento {
  return {
    rol,
    nombre: rol === "profesional" ? "Lucía Gómez" : "Ana Paz",
    dni: rol === "profesional" ? undefined : "30111222",
    enRepresentacion: false,
    metodo: "presencial",
    firmadoEn: "2026-09-27T14:05:00-03:00",
    trazo: trazo(),
    ...extra,
  };
}

const base = {
  id: "doc-1",
  plantillaId: conducto.id,
  plantillaVersion: 1,
  plantillaNombre: "Tratamiento de conducto",
  tipo: "consentimiento",
  paciente: { id: "pac-1", nombre: "Ana", apellido: "Paz", dni: "30111222" },
  autorUserId: "user-1",
  autorNombre: "Lucía Gómez",
  esMio: true,
  tienePDF: false,
  creadoEn: "2026-09-27T10:00:00-03:00",
  actualizadoEn: "2026-09-27T10:05:00-03:00",
  firmas: [],
  firmasPendientes: [],
};

export function borrador(valores: Record<string, unknown> = {}): DocumentoDetalle {
  return { ...base, estado: "borrador", valores, hoy: "2026-09-27" };
}

export function contenidoDe(valores: Record<string, unknown>) {
  return {
    formato: 1,
    documentoId: "doc-1",
    plantilla: { id: conducto.id, version: 1, nombre: conducto.nombre, tipo: conducto.tipo, fuente: conducto.fuente },
    clinica: { id: "cli-1", nombre: "Clínica Sur" },
    paciente: { id: "pac-1", nombre: "Ana", apellido: "Paz", dni: "30111222" },
    profesional: { userId: "user-1", nombre: "Lucía", apellido: "Gómez", matriculaTipo: "provincial", matriculaNumero: "1234" },
    fecha: "2026-09-27",
    terminadoEn: "2026-09-27T14:00:00-03:00",
    valores,
    cuerpo: armarCuerpo(conducto, valores as never, { fecha: "2026-09-27" }, "sellado"),
    firmas: conducto.firmas,
  };
}

const valoresCompletos = {
  lugar: "Córdoba",
  suscribe_nombre: "Ana Paz",
  suscribe_fecha_nacimiento: "1984-03-07",
  suscribe_dni: "30111222",
  suscribe_domicilio: "Av. Colón 1240",
  elementos: ["36"],
  profesional_nombre: "Lucía Gómez",
};

export function aFirmar(firmas: FirmaDeDocumento[] = [], extra: Partial<DocumentoDetalle> = {}): DocumentoDetalle {
  const firmados = new Set(firmas.map((f) => f.rol));
  return {
    ...base,
    estado: "a_firmar",
    contenido: contenidoDe(valoresCompletos),
    hashContenido: "a3f1c0de9b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a392817060000",
    terminadoEn: "2026-09-27T14:00:00-03:00",
    firmas,
    firmasPendientes: ["paciente", "profesional"].filter((r) => !firmados.has(r)),
    ...extra,
  };
}

/** El mismo documento, con la lámina que congela la API (TR-187). */
export function conLamina(documento: DocumentoDetalle): DocumentoDetalle {
  const contenido = documento.contenido as ReturnType<typeof contenidoDe>;
  return {
    ...documento,
    contenido: { ...contenido, lamina: armarLamina(conducto, valoresCompletos as never, { fecha: "2026-09-27" }, "sellado") },
  };
}

/** Un consentimiento terminado: se firma a mano (TR-188). */
export function paraImprimir(extra: Partial<DocumentoDetalle> = {}): DocumentoDetalle {
  return { ...aFirmar(), estado: "para_imprimir", firmasPendientes: [], tienePDF: true, ...extra };
}

export function sellado(): DocumentoDetalle {
  return {
    ...aFirmar([firma("paciente"), firma("profesional")]),
    estado: "sellado",
    folio: 3,
    cadenaN: 12,
    selladoEn: "2026-09-27T14:06:00-03:00",
    hashSello: "ffff0000aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777",
    firmasPendientes: [],
    tienePDF: true,
  };
}
