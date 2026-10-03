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
import { piezasDe } from "./piezas";

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
  /** Solo el número, sin "MP": lo que va en las casillas del papel. */
  "profesional.matriculaNumero",
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
 *  5.2). Para el renglón de la aclaración de un sí o no, `{{campo:detalle}}`:
 *  solo lo aclarado, sin "Sí" (Fase 5.5). Grupo 1: el campo; 2: la parte
 *  (de la fecha, o `detalle`); 3: la opción. */
export const MARCA_DE_ZONA = /\{\{([a-z][a-z0-9_.]*)(?::(dia|mes_nombre|mes|anio2|anio|detalle)|=([a-z0-9_]{1,40}))?\}\}/g;

/** Lo que se escribe en la casilla de la opción elegida. */
export const MARCA_DE_CASILLA = "X";

/** Lo que dice un hueco chico vacío en un documento terminado: una fila
 *  de casillas, la cantidad de dientes existentes. */
export const SIN_DATO = "—";

/** Qué herramientas y qué rótulos lleva un odontograma (Fase 5.5): la
 *  historia general (con prótesis) o la de odontopediatría (con sellador
 *  y traumatizado). */
export const LEYENDAS_DE_ODONTOGRAMA = ["general", "pediatrica"] as const;

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
const denticion = z.enum(["permanente", "temporaria", "ambas"]).optional();

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
  z.object({ tipo: z.literal("piezas"), ...base, denticion }).strict(),
  z
    .object({
      tipo: z.literal("odontograma"),
      ...base,
      denticion,
      leyenda: z.enum(LEYENDAS_DE_ODONTOGRAMA),
      /** Pide la "Cantidad de dientes existentes" del papel. */
      existentes: z.boolean().optional(),
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
    /** Una fila de casillas de a un carácter ("Nº de Matrícula", "Nº
     *  AFIL"): cada carácter va centrado en la suya, sin achicar ni cortar
     *  (Fase 5.5). `paso` es el ancho de cada casilla. */
    casillas: z.object({ cantidad: z.number().int().min(1).max(40), paso: z.number().positive().max(2000) }).strict().optional(),
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

/** El recuadro de una pieza del odontograma en el papel: su esquina de
 *  arriba a la izquierda y su lado. */
export const recuadroDePiezaSchema = z
  .object({ pieza: z.string(), x: punto, y: punto, lado: z.number().positive().max(200) })
  .strict();
export type RecuadroDePieza = z.infer<typeof recuadroDePiezaSchema>;

/** Dónde está cada pieza de un campo odontograma (Fase 5.5) y, si lo pide,
 *  la caja de la cantidad de dientes existentes (`y`: la línea de base). */
export const odontogramaDeLaminaSchema = z
  .object({
    campo: idDeCampo,
    pagina: z.number().int().min(1),
    piezas: z.array(recuadroDePiezaSchema).min(1),
    existentes: z
      .object({ x: punto, y: punto, ancho: z.number().positive().max(2000), tamano: z.number().min(4).max(24).optional() })
      .strict()
      .optional(),
  })
  .strict();
export type OdontogramaDeLamina = z.infer<typeof odontogramaDeLaminaSchema>;

export const laminaSchema = z
  .object({
    paginas: z.array(z.object({ ancho: z.number().positive(), alto: z.number().positive() }).strict()).min(1).max(20),
    zonas: z.array(zonaSchema).min(1),
    firmas: z.array(lugarDeFirmaSchema).min(1),
    odontogramas: z.array(odontogramaDeLaminaSchema).min(1).optional(),
  })
  .strict();
export type Lamina = z.infer<typeof laminaSchema>;
type PaginaDeLamina = Lamina["paginas"][number];

function marcasDe(textoConMarcas: string): string[] {
  return [...textoConMarcas.matchAll(MARCA)].map((m) => m[1]);
}

/** Todas las marcas `{{…}}` de un bloque. */
export function marcasDelBloque(bloque: Bloque): string[] {
  if (bloque.t === "lista") return bloque.items.flatMap(marcasDe);
  if (bloque.t === "campo" || bloque.t === "firmas") return [];
  return marcasDe(bloque.texto);
}

/** Una fila de casillas ocupa un solo renglón y entra en la página. */
function problemasDeCasillas(zona: Zona, pagina: PaginaDeLamina | undefined): string[] {
  if (!zona.casillas) return [];
  const problemas: string[] = [];
  if ((zona.lineas ?? 1) !== 1) problemas.push(`la zona ${zona.id} tiene casillas en más de un renglón`);
  if (pagina && zona.x + zona.casillas.cantidad * zona.casillas.paso > pagina.ancho) {
    problemas.push(`las casillas de la zona ${zona.id} se salen de la página`);
  }
  return problemas;
}

/** Exactamente un recuadro por pieza de la dentición, todos dentro de la
 *  página. */
function problemasDeRecuadros(o: OdontogramaDeLamina, esperadas: readonly string[], pagina: PaginaDeLamina): string[] {
  const problemas: string[] = [];
  const vistas = new Set<string>();
  for (const r of o.piezas) {
    if (vistas.has(r.pieza)) problemas.push(`el odontograma ${o.campo} repite la pieza ${r.pieza}`);
    else if (!esperadas.includes(r.pieza)) problemas.push(`el odontograma ${o.campo} ubica una pieza que no es de su dentición: ${r.pieza}`);
    vistas.add(r.pieza);
    if (r.x + r.lado > pagina.ancho || r.y + r.lado > pagina.alto) {
      problemas.push(`la pieza ${r.pieza} del odontograma ${o.campo} se sale de la página`);
    }
  }
  const faltan = esperadas.filter((p) => !vistas.has(p));
  if (faltan.length > 0) problemas.push(`el odontograma ${o.campo} no ubica las piezas ${faltan.join(", ")}`);
  return problemas;
}

/** La caja de los dientes existentes está si y solo si el campo la pide. */
function problemasDeExistentes(o: OdontogramaDeLamina, pide: boolean, pagina: PaginaDeLamina): string[] {
  if (!o.existentes) return pide ? [`el odontograma ${o.campo} no ubica la cantidad de dientes existentes`] : [];
  if (!pide) return [`el odontograma ${o.campo} ubica una cantidad de dientes existentes que el campo no pide`];
  const { x, y, ancho } = o.existentes;
  return x + ancho > pagina.ancho || y > pagina.alto ? [`la cantidad de dientes existentes del odontograma ${o.campo} se sale de la página`] : [];
}

/** `:detalle` va solo sobre un sí o no; las partes de una fecha, solo sobre
 *  una fecha. */
function problemaDeParte(zona: string, nombre: string, parte: string | undefined, tipo: Campo["tipo"]): string | null {
  if (!parte) return null;
  if (parte === "detalle") return tipo === "si_no" ? null : `la zona ${zona} pide la aclaración de un campo que no es sí o no: ${nombre}`;
  return tipo === "fecha" ? null : `la zona ${zona} parte un campo que no es fecha: ${nombre}`;
}

function problemasDelOdontograma(o: OdontogramaDeLamina, campo: Campo | undefined, paginas: PaginaDeLamina[]): string[] {
  if (campo?.tipo !== "odontograma") return [`la lámina ubica un odontograma en un campo que no lo es: ${o.campo}`];
  const pagina = paginas[o.pagina - 1];
  if (!pagina) return [`el odontograma ${o.campo} está en una página que no existe`];
  return [
    ...problemasDeRecuadros(o, piezasDe(campo.denticion ?? "ambas"), pagina),
    ...problemasDeExistentes(o, campo.existentes === true, pagina),
  ];
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
        for (const message of problemasDeCasillas(z0, pagina)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        for (const m of z0.texto.matchAll(MARCA_DE_ZONA)) {
          const nombre = m[1];
          const delSistema = (VARIABLES_DEL_SISTEMA as readonly string[]).includes(nombre);
          const campo = delSistema ? undefined : campos.find((c) => c.id === nombre);
          if (!delSistema && !campo) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `la zona ${z0.id} marca un campo que no existe: ${nombre}` });
            continue;
          }
          // La única variable del sistema es la fecha del documento.
          const problema = problemaDeParte(z0.id, nombre, m[2], campo?.tipo ?? "fecha");
          if (problema) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problema });
          if (!campo) continue;
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
      const odontogramas = new Set<string>();
      for (const o of l.odontogramas ?? []) {
        if (odontogramas.has(o.campo)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `odontograma repetido: ${o.campo}` });
        odontogramas.add(o.campo);
        enLaLamina.add(o.campo);
        const campo = campos.find((c) => c.id === o.campo);
        for (const message of problemasDelOdontograma(o, campo, l.paginas)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
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
