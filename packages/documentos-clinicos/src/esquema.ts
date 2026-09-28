// La forma de una plantilla (Fase 5, TR-183). Una plantilla es un documento
// del Colegio convertido en datos: qué campos pide (agrupados en las
// secciones del sidebar), cómo se lee el documento con esos campos
// adentro (el cuerpo, con marcas `{{campo}}`) y quién lo firma.
//
// El esquema valida la plantilla misma —no lo que carga el profesional,
// eso es valores.ts— y lo corre el registro al importarse y el generador
// antes de exportar a Go: una plantilla con una marca a un campo que no
// existe no llega nunca a la API.
import { z } from "zod";

/** De dónde se precarga un campo al crear el documento. Lo resuelve la
 *  API (tiene la ficha, el perfil y la clínica); acá solo se nombra. */
export const PRECARGAS = [
  "paciente.nombreCompleto",
  "paciente.dni",
  "paciente.fechaNacimiento",
  "paciente.domicilio",
  "paciente.obraSocial",
  "paciente.obraSocialPlan",
  "paciente.obraSocialAfiliado",
  "paciente.telefono",
  "paciente.email",
  "profesional.nombreCompleto",
  "profesional.matricula",
  "clinica.nombre",
  "clinica.ciudad",
] as const;
export type Precarga = (typeof PRECARGAS)[number];

/** Quién puede firmar un documento. "paciente" admite que firme un
 *  representante en su nombre; "representante" es solo el representante
 *  (odontopediatría). Los testigos son para cuando el paciente no puede
 *  firmar (Decreto 1089/2012, art. 7). */
export const ROLES_DE_FIRMA = [
  "paciente",
  "representante",
  "asentimiento",
  "profesional",
  "otro_profesional",
  "testigo_1",
  "testigo_2",
] as const;
export type RolDeFirma = (typeof ROLES_DE_FIRMA)[number];

export const TIPOS_DE_PLANTILLA = ["historia_clinica", "anexo", "consentimiento"] as const;
export type TipoDePlantilla = (typeof TIPOS_DE_PLANTILLA)[number];

/** Las variables que no son campos: las pone el sistema. `sistema.fecha`
 *  es el día en que el documento se terminó (en un borrador, hoy). */
export const VARIABLES_DEL_SISTEMA = ["sistema.fecha"] as const;

export const MARCA = /\{\{([a-z][a-z0-9_.]*)\}\}/g;

const idDeCampo = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/, "id de campo inválido");
const texto = z.string().min(1).max(4000);

const base = {
  id: idDeCampo,
  etiqueta: z.string().min(1).max(120),
  requerido: z.boolean().optional(),
  ayuda: z.string().max(300).optional(),
  precarga: z.enum(PRECARGAS).optional(),
  /** No se puede editar: queda lo precargado (el nombre del profesional). */
  bloqueado: z.boolean().optional(),
};

const opcion = z.object({ valor: z.string().regex(/^[a-z0-9_]{1,40}$/), etiqueta: z.string().min(1).max(120) }).strict();

export const campoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("texto"), ...base }).strict(),
  z.object({ tipo: z.literal("texto_largo"), ...base }).strict(),
  z.object({ tipo: z.literal("fecha"), ...base }).strict(),
  z.object({ tipo: z.literal("hora"), ...base }).strict(),
  z
    .object({
      tipo: z.literal("numero"),
      ...base,
      unidad: z.string().min(1).max(20).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      decimales: z.number().int().min(0).max(3).optional(),
    })
    .strict(),
  z
    .object({
      tipo: z.literal("si_no"),
      ...base,
      /** Una aclaración que se pide cuando la respuesta es `cuando`
       *  ("¿Toma medicación? Sí — ¿cuál?"). */
      detalle: z.object({ etiqueta: z.string().min(1).max(120), cuando: z.enum(["si", "no"]) }).strict().optional(),
    })
    .strict(),
  z.object({ tipo: z.literal("opcion_unica"), ...base, opciones: z.array(opcion).min(2).max(20) }).strict(),
  z.object({ tipo: z.literal("opcion_multiple"), ...base, opciones: z.array(opcion).min(2).max(30) }).strict(),
  z
    .object({
      tipo: z.literal("piezas"),
      ...base,
      denticion: z.enum(["permanente", "temporaria", "ambas"]).optional(),
    })
    .strict(),
]);
export type Campo = z.infer<typeof campoSchema>;
export type TipoDeCampo = Campo["tipo"];

export const bloqueSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("titulo"), texto }).strict(),
  z.object({ t: z.literal("subtitulo"), texto }).strict(),
  z.object({ t: z.literal("parrafo"), texto }).strict(),
  z.object({ t: z.literal("lista"), items: z.array(texto).min(1).max(60) }).strict(),
  /** Un campo que se lee solo, con su etiqueta ("Indicaciones: …"). */
  z.object({ t: z.literal("campo"), campo: idDeCampo }).strict(),
  /** Dónde van las firmas. */
  z.object({ t: z.literal("firmas") }).strict(),
]);
export type Bloque = z.infer<typeof bloqueSchema>;

export const seccionSchema = z
  .object({
    id: idDeCampo,
    titulo: z.string().min(1).max(80),
    campos: z.array(campoSchema).min(1),
  })
  .strict();
export type Seccion = z.infer<typeof seccionSchema>;

export const firmaSchema = z
  .object({
    rol: z.enum(ROLES_DE_FIRMA),
    etiqueta: z.string().min(1).max(120),
    requerida: z.boolean(),
  })
  .strict();
export type FirmaDePlantilla = z.infer<typeof firmaSchema>;

function marcasDe(textoConMarcas: string): string[] {
  return [...textoConMarcas.matchAll(MARCA)].map((m) => m[1]);
}

/** Todas las marcas `{{…}}` de un bloque. */
export function marcasDelBloque(bloque: Bloque): string[] {
  if (bloque.t === "lista") return bloque.items.flatMap(marcasDe);
  if (bloque.t === "campo" || bloque.t === "firmas") return [];
  return marcasDe(bloque.texto);
}

export const plantillaSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/, "id de plantilla inválido"),
    version: z.number().int().positive(),
    nombre: z.string().min(1).max(80),
    tipo: z.enum(TIPOS_DE_PLANTILLA),
    descripcion: z.string().min(1).max(300),
    fuente: z.object({ nombre: z.string().min(1), url: z.string().url() }).strict(),
    secciones: z.array(seccionSchema).min(1),
    cuerpo: z.array(bloqueSchema).min(1),
    firmas: z.array(firmaSchema).min(1),
  })
  .strict()
  .superRefine((p, ctx) => {
    const campos = p.secciones.flatMap((s) => s.campos);
    const ids = new Set<string>();
    for (const c of campos) {
      if (ids.has(c.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `campo repetido: ${c.id}` });
      ids.add(c.id);
    }
    const secciones = new Set<string>();
    for (const s of p.secciones) {
      if (secciones.has(s.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `sección repetida: ${s.id}` });
      secciones.add(s.id);
    }

    const usados = new Set<string>();
    for (const b of p.cuerpo) {
      if (b.t === "campo") {
        if (!ids.has(b.campo)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `el cuerpo muestra un campo que no existe: ${b.campo}` });
        usados.add(b.campo);
      }
      for (const m of marcasDelBloque(b)) {
        if ((VARIABLES_DEL_SISTEMA as readonly string[]).includes(m)) continue;
        if (!ids.has(m)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `marca a un campo que no existe: {{${m}}}` });
        usados.add(m);
      }
    }
    // Un campo que no aparece en el documento se carga y no se lee en
    // ningún lado: es un error de la plantilla, no una opción.
    for (const id of ids) {
      if (!usados.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `el campo ${id} no aparece en el cuerpo` });
    }

    if (p.cuerpo.filter((b) => b.t === "firmas").length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "el cuerpo tiene que tener exactamente un bloque de firmas" });
    }
    const roles = new Set<string>();
    for (const f of p.firmas) {
      if (roles.has(f.rol)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `firma repetida: ${f.rol}` });
      roles.add(f.rol);
    }
    // El consentimiento lo suscribe el profesional (Decreto 1089/2012,
    // art. 7), y cualquier asiento de la historia lleva quién lo hizo.
    if (!p.firmas.some((f) => f.rol === "profesional" && f.requerida)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "toda plantilla lleva la firma del profesional, obligatoria" });
    }
  });
export type Plantilla = z.infer<typeof plantillaSchema>;

export function camposDe(plantilla: Plantilla): Campo[] {
  return plantilla.secciones.flatMap((s) => s.campos);
}

export function campoPorId(plantilla: Plantilla, id: string): Campo | undefined {
  return camposDe(plantilla).find((c) => c.id === id);
}

/** En qué sección del sidebar vive un campo — para abrirla al tocar esa
 *  parte del calco. */
export function seccionDelCampo(plantilla: Plantilla, id: string): Seccion | undefined {
  return plantilla.secciones.find((s) => s.campos.some((c) => c.id === id));
}
