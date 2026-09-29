import { describe, expect, it } from "vitest";
import {
  armarCuerpo,
  buscarPlantillas,
  camposDe,
  campoPorId,
  esFechaValida,
  esPiezaValida,
  estaVacio,
  HUECO,
  NO_CONSIGNA,
  normalizar,
  PIEZAS_PERMANENTES,
  PIEZAS_TEMPORARIAS,
  plantillaPorId,
  plantillaSchema,
  PLANTILLAS,
  plantillasVigentes,
  seccionDelCampo,
  segmentar,
  seFirmaEnPapel,
  validarValores,
  valorComoTexto,
  valoresDeEjemplo,
  type Campo,
  type Plantilla,
} from "./index";

// Una plantilla chica que usa todos los tipos de campo: la de conducto no
// alcanza para probar el motor entero.
const completa: Plantilla = plantillaSchema.parse({
  id: "prueba-completa",
  version: 1,
  nombre: "Prueba",
  tipo: "historia_clinica",
  descripcion: "Plantilla de prueba con todos los tipos de campo.",
  fuente: { nombre: "Tests", url: "https://example.com" },
  secciones: [
    {
      id: "todo",
      titulo: "Todo",
      campos: [
        { tipo: "texto", id: "nombre", etiqueta: "Nombre", requerido: true },
        { tipo: "texto_largo", id: "notas", etiqueta: "Notas" },
        { tipo: "fecha", id: "dia", etiqueta: "Día" },
        { tipo: "hora", id: "hora", etiqueta: "Hora" },
        { tipo: "numero", id: "peso", etiqueta: "Peso", unidad: "kg", min: 1, max: 300, decimales: 1 },
        { tipo: "numero", id: "hijos", etiqueta: "Hijos" },
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
            { valor: "labios", etiqueta: "Labios" },
          ],
        },
        { tipo: "piezas", id: "piezas", etiqueta: "Piezas", denticion: "permanente" },
      ],
    },
  ],
  cuerpo: [
    { t: "titulo", texto: "Prueba" },
    { t: "parrafo", texto: "{{nombre}} el {{sistema.fecha}} a las {{hora}} ({{dia}}), {{peso}}, {{hijos}} hijos." },
    { t: "lista", items: ["Alergia: {{alergia}}", "Higiene: {{higiene}}", "Hábitos: {{habitos}}", "Piezas: {{piezas}}"] },
    { t: "campo", campo: "notas" },
    { t: "firmas" },
  ],
  firmas: [{ rol: "profesional", etiqueta: "Firma", requerida: true }],
});

const contexto = { fecha: "2026-09-27" };

describe("piezas FDI", () => {
  it("son 32 permanentes y 20 temporarias, en el orden del odontograma", () => {
    expect(PIEZAS_PERMANENTES).toHaveLength(32);
    expect(PIEZAS_TEMPORARIAS).toHaveLength(20);
    expect(PIEZAS_PERMANENTES.slice(0, 9)).toEqual(["18", "17", "16", "15", "14", "13", "12", "11", "21"]);
    expect(PIEZAS_TEMPORARIAS.slice(0, 6)).toEqual(["55", "54", "53", "52", "51", "61"]);
  });

  it("valida contra la dentición", () => {
    expect(esPiezaValida("36")).toBe(true);
    expect(esPiezaValida("75", "permanente")).toBe(false);
    expect(esPiezaValida("75", "temporaria")).toBe(true);
    expect(esPiezaValida("19")).toBe(false);
  });
});

describe("validarValores", () => {
  it("un borrador puede tener vacíos los obligatorios; terminar, no", () => {
    expect(validarValores(completa, {}, "tolerante")).toEqual([]);
    expect(validarValores(completa, {}, "estricto")).toEqual([{ campo: "nombre", mensaje: "Este dato es obligatorio." }]);
  });

  it("rechaza un campo que no es del documento, en los dos modos", () => {
    const errores = validarValores(completa, { nombre: "Ana", inventado: "x" }, "tolerante");
    expect(errores).toEqual([{ campo: "inventado", mensaje: "Este campo no es de este documento." }]);
  });

  it("rechaza datos que no son un objeto", () => {
    expect(validarValores(completa, [], "tolerante")[0].mensaje).toMatch(/forma esperada/);
    expect(validarValores(completa, null, "tolerante")).toHaveLength(1);
  });

  it.each<[string, unknown, RegExp]>([
    ["nombre", 12, /texto/],
    ["nombre", "x".repeat(501), /500/],
    ["notas", "x".repeat(5001), /5000/],
    ["dia", "2026-02-30", /fecha/],
    ["dia", "27/09/2026", /fecha/],
    ["dia", "1850-01-01", /fecha/],
    ["hora", "24:00", /hora/],
    ["peso", "70", /número/],
    ["peso", 0.5, /1 o más/],
    ["peso", 301, /300 o menos/],
    ["peso", 70.25, /1 decimales/],
    ["hijos", 1.5, /entero/],
    ["alergia", "si", /Sí o No/],
    ["alergia", { respuesta: "tal vez" }, /Sí o No/],
    ["alergia", { respuesta: "si", otra: 1 }, /no corresponden/],
    ["alergia", { respuesta: "si", detalle: 3 }, /texto/],
    ["alergia", { respuesta: "si", detalle: "x".repeat(1001) }, /1000/],
    ["higiene", "regular", /opciones/],
    ["habitos", "dedo", /opciones/],
    ["habitos", ["dedo", "dedo"], /repetida/],
    ["habitos", ["pie"], /no existe/],
    ["piezas", "36", /piezas/],
    ["piezas", ["36", "36"], /repetida/],
    ["piezas", ["75"], /75 no es/],
  ])("%s = %j es inválido", (campo, valor, mensaje) => {
    const errores = validarValores(completa, { [campo]: valor }, "tolerante");
    expect(errores).toHaveLength(1);
    expect(errores[0].campo).toBe(campo);
    expect(errores[0].mensaje).toMatch(mensaje);
  });

  it("acepta valores bien formados", () => {
    const valores = {
      nombre: "Ana",
      notas: "ok",
      dia: "2024-02-29",
      hora: "23:59",
      peso: 70.5,
      hijos: 2,
      alergia: { respuesta: "no" },
      higiene: "buena",
      habitos: ["lengua"],
      piezas: ["11", "48"],
    };
    expect(validarValores(completa, valores, "estricto")).toEqual([]);
  });

  it("al terminar, un SI que pide detalle sin detalle es un error", () => {
    const errores = validarValores(completa, { nombre: "Ana", alergia: { respuesta: "si" } }, "estricto");
    expect(errores).toEqual([{ campo: "alergia", mensaje: "Completá: ¿A qué?." }]);
    expect(validarValores(completa, { nombre: "Ana", alergia: { respuesta: "si" } }, "tolerante")).toEqual([]);
  });

  it("vacío es: nada, texto en blanco, lista vacía o SI/NO sin respuesta", () => {
    const campo = campoPorId(completa, "alergia") as Campo;
    expect(estaVacio(campo, undefined)).toBe(true);
    expect(estaVacio(campo, "  ")).toBe(true);
    expect(estaVacio(campo, [])).toBe(true);
    expect(estaVacio(campo, {})).toBe(true);
    expect(estaVacio(campo, { respuesta: "" })).toBe(true);
    expect(estaVacio(campo, { respuesta: "no" })).toBe(false);
    expect(estaVacio(campo, { respuesta: "tal vez" })).toBe(false);
    expect(estaVacio(campoPorId(completa, "peso") as Campo, 0)).toBe(false);
  });

  it("esFechaValida conoce los bisiestos", () => {
    expect(esFechaValida("2024-02-29")).toBe(true);
    expect(esFechaValida("2025-02-29")).toBe(false);
    expect(esFechaValida("2026-13-01")).toBe(false);
  });
});

describe("cómo se lee cada valor", () => {
  const c = (id: string) => campoPorId(completa, id) as Campo;
  it.each<[string, unknown, string]>([
    ["nombre", "  Ana  ", "Ana"],
    ["dia", "2026-09-07", "07/09/2026"],
    ["hora", "08:05", "08:05"],
    ["peso", 70, "70,0 kg"],
    ["hijos", 3, "3"],
    ["alergia", { respuesta: "si", detalle: " penicilina " }, "Sí (penicilina)"],
    ["alergia", { respuesta: "no" }, "No"],
    ["higiene", "mala", "Mala"],
    ["habitos", ["labios", "dedo"], "Dedo, Labios"],
    ["piezas", ["36", "11", "18"], "18, 11, 36"],
    ["nombre", "", ""],
  ])("%s %j → %s", (id, valor, esperado) => {
    expect(valorComoTexto(c(id), valor)).toBe(esperado);
  });
});

describe("armar el documento", () => {
  it("en un borrador lo vacío es un hueco; sellado, «No consigna»", () => {
    const valores = { nombre: "Ana", hora: "10:00" };
    const borrador = armarCuerpo(completa, valores, contexto, "borrador");
    const sellado = armarCuerpo(completa, valores, contexto, "sellado");
    expect(borrador[1]).toEqual({ t: "parrafo", texto: `Ana el 27/09/2026 a las 10:00 (${HUECO}), ${HUECO}, ${HUECO} hijos.` });
    expect(sellado[1]).toEqual({
      t: "parrafo",
      texto: `Ana el 27/09/2026 a las 10:00 (${NO_CONSIGNA}), ${NO_CONSIGNA}, ${NO_CONSIGNA} hijos.`,
    });
    expect(sellado[3]).toEqual({ t: "campo", campo: "notas", etiqueta: "Notas", texto: NO_CONSIGNA });
    expect(borrador[3]).toEqual({ t: "campo", campo: "notas", etiqueta: "Notas", texto: HUECO });
    expect(sellado[4]).toEqual({ t: "firmas" });
    expect(sellado[0]).toEqual({ t: "titulo", texto: "Prueba" });
  });

  it("segmentar separa lo fijo de los campos, y marca los vacíos", () => {
    const segmentos = segmentar("Hola {{nombre}}, {{hora}}.", completa, { nombre: "Ana" }, contexto);
    expect(segmentos).toEqual([
      { tipo: "texto", texto: "Hola " },
      { tipo: "campo", campoId: "nombre", texto: "Ana", vacio: false },
      { tipo: "texto", texto: ", " },
      { tipo: "campo", campoId: "hora", texto: "", vacio: true },
      { tipo: "texto", texto: "." },
    ]);
  });

  it("una marca a algo que no es un campo queda vacía (no rompe)", () => {
    expect(segmentar("{{desconocido}}", completa, {}, contexto)).toEqual([
      { tipo: "campo", campoId: "desconocido", texto: "", vacio: true },
    ]);
  });
});

describe("el esquema de una plantilla", () => {
  const base = {
    id: "mal-armada",
    version: 1,
    nombre: "Mal",
    tipo: "consentimiento",
    descripcion: "x",
    fuente: { nombre: "x", url: "https://example.com" },
    secciones: [{ id: "s", titulo: "S", campos: [{ tipo: "texto", id: "a", etiqueta: "A" }] }],
    cuerpo: [{ t: "parrafo", texto: "{{a}}" }, { t: "firmas" }],
    firmas: [{ rol: "profesional", etiqueta: "Firma", requerida: true }],
  };
  const mensajes = (p: unknown) => {
    const r = plantillaSchema.safeParse(p);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("la base es válida", () => expect(mensajes(base)).toEqual([]));

  it("rechaza una marca a un campo que no existe", () => {
    expect(mensajes({ ...base, cuerpo: [{ t: "parrafo", texto: "{{a}} {{b}}" }, { t: "firmas" }] })).toContain(
      "marca a un campo que no existe: {{b}}",
    );
  });

  it("rechaza un campo que no aparece en el documento", () => {
    expect(mensajes({ ...base, cuerpo: [{ t: "parrafo", texto: "nada" }, { t: "firmas" }] })).toContain(
      "el campo a no aparece en el cuerpo",
    );
  });

  it("rechaza un bloque de campo inexistente", () => {
    expect(mensajes({ ...base, cuerpo: [{ t: "parrafo", texto: "{{a}}" }, { t: "campo", campo: "z" }, { t: "firmas" }] })).toContain(
      "el cuerpo muestra un campo que no existe: z",
    );
  });

  it("exige un bloque de firmas, uno solo", () => {
    expect(mensajes({ ...base, cuerpo: [{ t: "parrafo", texto: "{{a}}" }] })).toContain(
      "el cuerpo tiene que tener exactamente un bloque de firmas",
    );
  });

  it("exige la firma del profesional, obligatoria", () => {
    expect(mensajes({ ...base, firmas: [{ rol: "paciente", etiqueta: "P", requerida: true }] })).toContain(
      "toda plantilla lleva la firma del profesional, obligatoria",
    );
  });

  it("rechaza campos, secciones y firmas repetidos", () => {
    const repetida = {
      ...base,
      secciones: [
        { id: "s", titulo: "S", campos: [{ tipo: "texto", id: "a", etiqueta: "A" }] },
        { id: "s", titulo: "S2", campos: [{ tipo: "texto", id: "a", etiqueta: "A" }] },
      ],
      firmas: [
        { rol: "profesional", etiqueta: "F", requerida: true },
        { rol: "profesional", etiqueta: "F", requerida: true },
      ],
    };
    const m = mensajes(repetida);
    expect(m).toContain("campo repetido: a");
    expect(m).toContain("sección repetida: s");
    expect(m).toContain("firma repetida: profesional");
  });
});

describe("el registro", () => {
  it("todas las plantillas son válidas y tienen fuente", () => {
    expect(PLANTILLAS.length).toBeGreaterThan(0);
    for (const p of PLANTILLAS) {
      expect(plantillaSchema.safeParse(p).success).toBe(true);
      expect(p.fuente.url).toMatch(/^https:\/\//);
    }
  });

  it("los ejemplos de cada plantilla son válidos para terminarla", () => {
    for (const p of PLANTILLAS) {
      expect(validarValores(p, valoresDeEjemplo(p), "estricto")).toEqual([]);
    }
  });

  it("los ejemplos cubren todos los tipos de campo y dejan vacío uno de cada cuatro opcionales", () => {
    const valores = valoresDeEjemplo(completa);
    expect(validarValores(completa, valores, "estricto")).toEqual([]);
    expect(valores).toMatchObject({ nombre: "Ejemplo de nombre", hijos: 12, higiene: "buena", piezas: ["37", "11", "36"] });
    // Opcionales en orden: notas, dia, hora, peso (4.º → vacío), hijos,
    // alergia, higiene, habitos (8.º → vacío), piezas.
    expect(Object.keys(valores)).not.toContain("peso");
    expect(Object.keys(valores)).not.toContain("habitos");
    const conMinimo = plantillaSchema.parse({
      ...completa,
      id: "prueba-minimo",
      secciones: [
        {
          id: "s",
          titulo: "S",
          campos: [
            { tipo: "numero", id: "peso", etiqueta: "Peso", requerido: true, min: 3 },
            { tipo: "numero", id: "talla", etiqueta: "Talla", requerido: true, decimales: 2 },
            {
              tipo: "opcion_multiple",
              id: "habitos",
              etiqueta: "Hábitos",
              requerido: true,
              opciones: [
                { valor: "a", etiqueta: "A" },
                { valor: "b", etiqueta: "B" },
              ],
            },
          ],
        },
      ],
      cuerpo: [{ t: "parrafo", texto: "{{peso}} {{talla}} {{habitos}}" }, { t: "firmas" }],
    });
    expect(valoresDeEjemplo(conMinimo)).toEqual({ peso: 3, talla: 12.5, habitos: ["b", "a"] });
    const temporaria = plantillaSchema.parse({
      ...completa,
      id: "prueba-temporaria",
      secciones: [{ id: "s", titulo: "S", campos: [{ tipo: "piezas", id: "piezas", etiqueta: "P", requerido: true, denticion: "temporaria" }] }],
      cuerpo: [{ t: "parrafo", texto: "{{piezas}}" }, { t: "firmas" }],
    });
    expect(valoresDeEjemplo(temporaria)).toEqual({ piezas: ["75", "51"] });
  });

  it("plantillaPorId devuelve la última versión, o la pedida", () => {
    expect(plantillaPorId("consentimiento-tratamiento-conducto")?.version).toBe(1);
    expect(plantillaPorId("consentimiento-tratamiento-conducto", 1)?.nombre).toBe("Tratamiento de conducto");
    expect(plantillaPorId("consentimiento-tratamiento-conducto", 99)).toBeUndefined();
    expect(plantillaPorId("no-existe")).toBeUndefined();
  });

  it("el buscador ignora tildes y mayúsculas", () => {
    expect(normalizar(" Extracción ")).toBe("extraccion");
    expect(buscarPlantillas("CONDUCTO").map((p) => p.id)).toEqual(["consentimiento-tratamiento-conducto"]);
    expect(buscarPlantillas("consentimiento informado conducto")).toHaveLength(1);
    expect(buscarPlantillas("ortodoncia").map((p) => p.id)).toContain("consentimiento-ortodoncia");
    expect(buscarPlantillas("protesis removible").map((p) => p.id)).toEqual(["consentimiento-protesis-removible"]);
    expect(buscarPlantillas("blanqueamiento")).toEqual([]);
    expect(buscarPlantillas("  ")).toHaveLength(plantillasVigentes().length);
  });

  it("están los catorce consentimientos del Colegio, todos con su lámina, y el de COVID afuera (D6)", () => {
    const consentimientos = plantillasVigentes().filter((p) => p.tipo === "consentimiento");
    expect(consentimientos).toHaveLength(14);
    expect(consentimientos.every((p) => p.lamina)).toBe(true);
    expect(consentimientos.some((p) => normalizar(p.nombre).includes("covid"))).toBe(false);
    // Todos se firman en papel (TR-188).
    expect(consentimientos.every((p) => seFirmaEnPapel(p))).toBe(true);
  });

  it("el consentimiento de conducto se lee con las piezas en orden y sin huecos", () => {
    const p = plantillaPorId("consentimiento-tratamiento-conducto") as Plantilla;
    const cuerpo = armarCuerpo(p, valoresDeEjemplo(p), contexto, "sellado");
    const suscribe = cuerpo.find((b) => b.t === "parrafo" && b.texto.startsWith("El/la que suscribe"));
    expect(suscribe).toMatchObject({ texto: expect.stringContaining("en el elemento N° 11, 36, 37 propuesto") });
    expect(JSON.stringify(cuerpo)).not.toContain(HUECO);
  });

  it("seccionDelCampo encuentra dónde vive cada campo", () => {
    const p = plantillaPorId("consentimiento-tratamiento-conducto") as Plantilla;
    expect(seccionDelCampo(p, "elementos")?.id).toBe("tratamiento");
    expect(seccionDelCampo(p, "nada")).toBeUndefined();
    expect(camposDe(p).every((c) => seccionDelCampo(p, c.id))).toBe(true);
  });
});

describe("dónde se firma", () => {
  it("un consentimiento, en papel; lo demás, en el sistema", () => {
    expect(seFirmaEnPapel(plantillaPorId("consentimiento-tratamiento-conducto") as Plantilla)).toBe(true);
    expect(seFirmaEnPapel(completa)).toBe(false);
  });
});
