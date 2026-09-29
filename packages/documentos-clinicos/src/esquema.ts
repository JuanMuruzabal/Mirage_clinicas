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

/** Las marcas de una zona de la lámina: `{{campo}}` o, para una fecha que
 *  el papel pide en partes (`___/___/___`), `{{campo:dia}}`, `:mes`,
 *  `:mes_nombre` ("septiembre"), `:anio` o `:anio2` (los dos últimos
 *  dígitos); también la fecha del documento (`{{sistema.fecha:dia}}`,
 *  "Córdoba ___ de ______ 20__"). Para una casilla del
 *  papel ("CONSIENTO ___ o NO CONSIENTO ___", "☐ Hospital"),
 *  `{{campo=valor}}`: una "X" si se eligió esa opción, nada si no (Fase
 *  5.2). Grupo 1: el campo; 2: la parte de la fecha; 3: la opción. */
export const MARCA_DE_ZONA = /\{\{([a-z][a-z0-9_.]*)(?::(dia|mes_nombre|mes|anio2|anio)|=([a-z0-9_]{1,40}))?\}\}/g;

/** Lo que se escribe en la casilla de la opción elegida. */
export const MARCA_DE_CASILLA = "X";

/** Los valores que se pueden marcar en una casilla de un campo: las
 *  opciones, o "si"/"no" para una pregunta de sí o no. */
export function opcionesMarcables(campo: Campo): string[] | null {
  if (campo.tipo === "si_no") return ["si", "no"];
  if (campo.tipo === "opcion_unica" || campo.tipo === "opcion_multiple") return campo.opciones.map((o) => o.valor);
  return null;
}

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

// La lámina (TR-187, addendum del 2026-09-28): dónde va cada dato sobre la
// página original del Colegio, en puntos del PDF (1/72 de pulgada, con el
// origen arriba a la izquierda). Ver lamina.ts.
const punto = z.number().min(0).max(2000);

export const zonaSchema = z
  .object({
    id: idDeCampo,
    pagina: z.number().int().min(1),
    x: punto,
    /** La línea de base del primer renglón. */
    y: punto,
    ancho: z.number().positive().max(2000),
    /** Cuántos renglones tiene el hueco en el papel (1 si no se dice). */
    lineas: z.number().int().min(1).max(60).optional(),
    interlineado: z.number().positive().max(100).optional(),
    /** El tamaño de letra de partida, en puntos (10 si no se dice). */
    tamano: z.number().min(4).max(24).optional(),
    /** Hasta dónde se achica para entrar (el 60 % del de partida si no se dice). */
    minimo: z.number().min(3).max(24).optional(),
    alinear: z.enum(["izquierda", "centro"]).optional(),
    /** Cuánto más a la derecha empieza el primer renglón: un hueco que
     *  arranca a mitad del renglón de su título ("Observaciones: ……") y
     *  sigue en los renglones enteros de abajo (Fase 5.2). */
    sangria: z.number().positive().max(2000).optional(),
    /** Lo que se escribe, con marcas (`{{lugar}}, {{sistema.fecha}}`). */
    texto: z.string().min(1).max(500),
    /** Lo que dice la zona vacía en un documento terminado ("No consigna"
     *  si no se dice; en un hueco chico, "—"). */
    vacio: z.string().min(1).max(40).optional(),
  })
  .strict();
export type Zona = z.infer<typeof zonaSchema>;

export const lugarDeFirmaSchema = z
  .object({
    rol: z.enum(ROLES_DE_FIRMA),
    pagina: z.number().int().min(1),
    x: punto,
    /** La línea sobre la que se firma. */
    y: punto,
    ancho: z.number().positive().max(2000),
    /** Cuánto lugar hay arriba de la línea para el trazo. */
    alto: z.number().positive().max(300),
  })
  .strict();
export type LugarDeFirma = z.infer<typeof lugarDeFirmaSchema>;

export const laminaSchema = z
  .object({
    paginas: z.array(z.object({ ancho: z.number().positive(), alto: z.number().positive() }).strict()).min(1).max(20),
    zonas: z.array(zonaSchema).min(1),
    firmas: z.array(lugarDeFirmaSchema).min(1),
  })
  .strict();
export type Lamina = z.infer<typeof laminaSchema>;

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
    lamina: laminaSchema.optional(),
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

    if (p.lamina) {
      const l = p.lamina;
      const zonas = new Set<string>();
      const enLaLamina = new Set<string>();
      for (const z0 of l.zonas) {
        if (zonas.has(z0.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `zona repetida: ${z0.id}` });
        zonas.add(z0.id);
        const pagina = l.paginas[z0.pagina - 1];
        if (!pagina) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} está en una página que no existe` });
        } else if (z0.x + z0.ancho > pagina.ancho || z0.y > pagina.alto) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} se sale de la página` });
        }
        if (z0.sangria !== undefined && z0.sangria >= z0.ancho) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} tiene una sangría que no deja lugar` });
        }
        if ((z0.minimo ?? 0) > (z0.tamano ?? 10)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} tiene un mínimo mayor que su tamaño` });
        }
        for (const m of z0.texto.matchAll(MARCA_DE_ZONA)) {
          const nombre = m[1];
          if ((VARIABLES_DEL_SISTEMA as readonly string[]).includes(nombre)) continue;
          const campo = campos.find((c) => c.id === nombre);
          if (!campo) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} marca un campo que no existe: ${nombre}` });
            continue;
          }
          if (m[2] && campo.tipo !== "fecha") {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} parte un campo que no es fecha: ${nombre}` });
          }
          if (m[3]) {
            const marcables = opcionesMarcables(campo);
            if (!marcables) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} marca una casilla de un campo sin opciones: ${nombre}` });
            } else if (!marcables.includes(m[3])) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} marca una opción que ${nombre} no tiene: ${m[3]}` });
            }
          }
          enLaLamina.add(nombre);
        }
      }
      // Igual que con el cuerpo: lo que se carga tiene que verse en el papel.
      for (const id of ids) {
        if (!enLaLamina.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `el campo ${id} no aparece en la lámina` });
      }
      const lugares = new Set<string>();
      for (const f of l.firmas) {
        if (lugares.has(f.rol)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `lugar de firma repetido: ${f.rol}` });
        lugares.add(f.rol);
        if (!roles.has(f.rol)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la lámina ubica una firma que la plantilla no pide: ${f.rol}` });
        if (!l.paginas[f.pagina - 1]) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la firma ${f.rol} está en una página que no existe` });
      }
      for (const rol of roles) {
        if (!lugares.has(rol)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la lámina no ubica la firma ${rol}` });
      }
    }
  });
export type Plantilla = z.infer<typeof plantillaSchema>;

/** Un consentimiento informado se completa para imprimir y se firma a
 *  mano, en papel (TR-188): la firma del paciente tiene que ser física, y
 *  una firma electrónica no la reemplaza. Terminado, no espera firmas en
 *  el sistema ni se sella: queda "para imprimir". Mismo criterio que
 *  `SeFirmaEnPapel` de internal/documentos (Go). */
export function seFirmaEnPapel(plantilla: Pick<Plantilla, "tipo">): boolean {
  return plantilla.tipo === "consentimiento";
}

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
