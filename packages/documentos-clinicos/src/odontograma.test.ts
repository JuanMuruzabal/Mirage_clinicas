// El odontograma (Fase 5.5, TR-192): validación, texto, figuras, casillas de
// a un carácter y las reglas del esquema.
//
// La tabla de casos (testdata/odontograma.json de internal/documentos) la
// comparten este test y el de Go: los mismos valores tienen que dar los
// mismos mensajes, el mismo texto y las mismas figuras en los dos lados. Las
// figuras esperadas se calcularon a mano con las fórmulas del contrato
// (§6), sobre una geometría de prueba propia; abajo hay además un caso
// suelto con las cuentas escritas, para leerlas sin abrir el JSON.
import { describe, expect, it } from "vitest";
import {
  armarCuerpo,
  armarFiguras,
  armarLamina,
  componerZona,
  estaVacio,
  filaDe,
  PRECARGAS,
  plantillaPorId,
  plantillaSchema,
  sugerirExistentes,
  ladoDeCara,
  textoDeZona,
  validarValores,
  valorComoTexto,
  type Campo,
  type Plantilla,
  type Zona,
} from "./index";
import tablaCompartida from "../../../apps/api/internal/documentos/testdata/odontograma.json";

interface CasoDeValidacion {
  nombre: string;
  campo: Campo;
  valor: unknown;
  modo: "tolerante" | "estricto";
  mensaje: string | null;
}
interface CasoDeVacio {
  nombre: string;
  campo: Campo;
  valor: unknown;
  vacio: boolean;
}
interface CasoDeTexto {
  nombre: string;
  campo: Campo;
  valor: unknown;
  texto: string;
}
interface CasoDeFiguras {
  nombre: string;
  plantilla: Plantilla;
  valores: Record<string, unknown>;
  modo: "borrador" | "sellado";
  figuras: unknown[];
}

// Importado como JSON (resolveJsonModule), sin node:fs: el paquete no tiene
// los tipos de Node.
const TABLA = tablaCompartida as unknown as {
  validacion: CasoDeValidacion[];
  vacio: CasoDeVacio[];
  texto: CasoDeTexto[];
  figuras: CasoDeFiguras[];
};

/** Una plantilla mínima alrededor de un campo, sin lámina. */
function plantillaCon(campo: Campo): Plantilla {
  return {
    id: "odontograma-suelto",
    version: 1,
    nombre: "Odontograma suelto",
    tipo: "historia_clinica",
    descripcion: "Un campo odontograma solo.",
    fuente: { nombre: "Tests", url: "https://example.com/modelo" },
    secciones: [{ id: "examen", titulo: "Examen", campos: [campo] }],
    cuerpo: [{ t: "campo", campo: campo.id }, { t: "firmas" }],
    firmas: [{ rol: "profesional", etiqueta: "Profesional", requerida: true }],
  } as Plantilla;
}

const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** La plantilla de prueba con lámina: 32 recuadros y la caja de existentes. */
const conLamina = (): Plantilla => copia(TABLA.figuras[0].plantilla);

function mensajes(p: unknown): string[] {
  const r = plantillaSchema.safeParse(p);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("la validación (§3), con la tabla compartida con Go", () => {
  it.each(TABLA.validacion.map((c) => [c.nombre, c] as const))("%s", (_, caso) => {
    const errores = validarValores(plantillaCon(caso.campo), caso.valor === undefined ? {} : { odonto: caso.valor }, caso.modo);
    expect(errores).toEqual(caso.mensaje === null ? [] : [{ campo: "odonto", mensaje: caso.mensaje }]);
  });

  it("un solo mensaje por campo, aunque haya varios errores", () => {
    const campo = TABLA.validacion[0].campo;
    const errores = validarValores(
      plantillaCon(campo),
      { odonto: { piezas: { "99": { marcas: { x: "verde" } }, "16": { caras: { Q: "rojo" } } }, protesis: [{ tipo: "puente", desde: "13", hasta: "23", color: "rojo" }], existentes: -1 } },
      "estricto",
    );
    // "16" va antes que "99": el primero que aparece es la cara que no existe.
    expect(errores).toEqual([{ campo: "odonto", mensaje: "Hay una cara que no existe." }]);
  });

  it("no depende del orden en que se cargaron las claves", () => {
    const campo = TABLA.validacion[0].campo;
    const a = { piezas: { "21": { marcas: { sellador: "rojo" } }, "11": { marcas: { traumatizado: "rojo" } } } };
    const b = { piezas: { "11": { marcas: { traumatizado: "rojo" } }, "21": { marcas: { sellador: "rojo" } } } };
    const errA = validarValores(plantillaCon(campo), { odonto: a }, "tolerante");
    expect(errA).toEqual(validarValores(plantillaCon(campo), { odonto: b }, "tolerante"));
    expect(errA).toEqual([{ campo: "odonto", mensaje: "La marca traumatizado no va en este odontograma." }]);
  });
});

describe("cuándo está vacío (§2)", () => {
  it.each(TABLA.vacio.map((c) => [c.nombre, c] as const))("%s", (_, caso) => {
    expect(estaVacio(caso.campo, caso.valor ?? undefined)).toBe(caso.vacio);
  });
});

describe("el texto que se congela (§4)", () => {
  it.each(TABLA.texto.map((c) => [c.nombre, c] as const))("%s", (_, caso) => {
    expect(valorComoTexto(caso.campo, caso.valor)).toBe(caso.texto);
  });

  it("el ejemplo del contrato, al pie de la letra", () => {
    const campo = TABLA.texto[0].campo;
    expect(
      valorComoTexto(campo, {
        piezas: { "16": { caras: { O: "rojo", M: "rojo" }, marcas: { corona: "rojo" } }, "26": { marcas: { x: "azul" } }, "36": { caras: { D: "azul" } } },
        protesis: [{ tipo: "fija", desde: "23", hasta: "13", color: "rojo" }],
        existentes: 28,
      }),
    ).toBe(
      "Rojo, prestaciones existentes: 16 (caras mesial y oclusal; corona). Azul, prestaciones requeridas: 26 (ausente o a extraer), 36 (cara distal). Prótesis: fija en rojo, de 13 a 23. Dientes existentes: 28.",
    );
  });

  it("el cuerpo lo lee como cualquier campo, y vacío y sellado dice No consigna", () => {
    const campo = TABLA.texto[0].campo;
    const p = plantillaCon(campo);
    const [bloque] = armarCuerpo(p, { odonto: { existentes: 30 } } as never, { fecha: "2026-10-03" }, "sellado");
    expect(bloque).toMatchObject({ t: "campo", campo: "odonto", texto: "Dientes existentes: 30." });
    const [vacio] = armarCuerpo(p, {}, { fecha: "2026-10-03" }, "sellado");
    expect(vacio).toMatchObject({ t: "campo", campo: "odonto", texto: "No consigna" });
  });
});

describe("la fila de una pieza y lo que se sugiere", () => {
  it("filaDe va por el primer dígito", () => {
    expect(["18", "21", "48", "31", "55", "65", "85", "71"].map(filaDe)).toEqual([
      "sup-perm",
      "sup-perm",
      "inf-perm",
      "inf-perm",
      "sup-temp",
      "sup-temp",
      "inf-temp",
      "inf-temp",
    ]);
  });

  it("sugerirExistentes: 32 menos las permanentes con x, de cualquier color", () => {
    expect(sugerirExistentes({})).toBe(32);
    expect(
      sugerirExistentes({
        piezas: {
          "18": { marcas: { x: "rojo" } },
          "28": { marcas: { x: "azul" } },
          // Una temporaria no cuenta; una cara o una corona tampoco.
          "55": { marcas: { x: "rojo" } },
          "16": { caras: { O: "rojo" }, marcas: { corona: "rojo" } },
        },
      }),
    ).toBe(30);
  });
});

describe("las figuras (§6), con la tabla compartida con Go", () => {
  it.each(TABLA.figuras.map((c) => [c.nombre, c] as const))("%s", (_, caso) => {
    // La plantilla de prueba es válida para el esquema.
    expect(mensajes(caso.plantilla)).toEqual([]);
    // Y el valor también: un caso de figuras es algo que la API congelaría,
    // así que tiene que pasar la validación estricta (sin conflictos).
    expect(validarValores(plantillaSchema.parse(caso.plantilla), caso.valores as never, "estricto")).toEqual([]);
    const figuras = armarFiguras(plantillaSchema.parse(caso.plantilla), caso.valores as never, caso.modo);
    // El JSON exacto: `discontinua` aparece solo cuando es true.
    expect(JSON.parse(JSON.stringify(figuras))).toEqual(caso.figuras);
  });

  it("las cuentas de una pieza, escritas: la 16 en x=144, y=200, L=20", () => {
    // li = 8,4; xi = 144 + 5,8 = 149,8; yi = 205,8. La cara V (arriba en una
    // superior) es [(144,200), (164,200), (158,2;205,8), (149,8;205,8)], de
    // centroide (154; 202,9); achicada al 82 %: (145,8; 200,52), (162,2;
    // 200,52), (157,44; 205,28), (150,56; 205,28). La M de una pieza de la
    // derecha del paciente es el trapecio de la derecha.
    const p = plantillaSchema.parse(conLamina());
    const figuras = armarFiguras(p, { odonto: { piezas: { "16": { caras: { V: "rojo", M: "azul" }, marcas: { corona: "azul", x: "rojo" } } } } } as never, "borrador");
    expect(figuras).toEqual([
      { tipo: "poligono", pagina: 1, puntos: [[145.8, 200.52], [162.2, 200.52], [157.44, 205.28], [150.56, 205.28]], relleno: "rojo" },
      { tipo: "poligono", pagina: 1, puntos: [[163.48, 201.8], [163.48, 218.2], [158.72, 213.44], [158.72, 206.56]], relleno: "azul" },
      // La corona: un círculo de radio 0,62·L en el centro, antes que la x.
      { tipo: "circulo", pagina: 1, centro: [154, 210], radio: 12.4, color: "azul", grosor: 1.1 },
      // La x: m = 1,6.
      { tipo: "linea", pagina: 1, desde: [145.6, 201.6], hasta: [162.4, 218.4], color: "rojo", grosor: 1.4 },
      { tipo: "linea", pagina: 1, desde: [162.4, 201.6], hasta: [145.6, 218.4], color: "rojo", grosor: 1.4 },
    ]);
  });

  it("la M de una pieza de la izquierda del paciente es el trapecio de la izquierda, y abajo la V", () => {
    const p = plantillaSchema.parse(conLamina());
    // La 36: x = 100 + 22·13 + 10 = 396, y = 240. Abajo (V en una inferior):
    // [(396,260), (401,8;254,2), (410,2;254,2), (416,260)] → centroide
    // (406; 257,1) → (397,8; 259,48), (402,56; 254,72), (409,44; 254,72),
    // (414,2; 259,48).
    const [v] = armarFiguras(p, { odonto: { piezas: { "36": { caras: { V: "rojo" } } } } } as never, "borrador");
    expect(v).toEqual({ tipo: "poligono", pagina: 1, puntos: [[397.8, 259.48], [402.56, 254.72], [409.44, 254.72], [414.2, 259.48]], relleno: "rojo" });
    const [m] = armarFiguras(p, { odonto: { piezas: { "36": { caras: { M: "rojo" } } } } } as never, "borrador");
    // Izquierda: [(396,240), (401,8;245,8), (401,8;254,2), (396,260)] →
    // centroide (398,9; 250) → (396,52; 241,8), (401,28; 246,56), …
    expect(m).toMatchObject({ tipo: "poligono", puntos: [[396.52, 241.8], [401.28, 246.56], [401.28, 253.44], [396.52, 258.2]] });
  });

  it("una prótesis removible lleva discontinua; una fija no la lleva", () => {
    const p = plantillaSchema.parse(conLamina());
    const fija = armarFiguras(p, { odonto: { protesis: [{ tipo: "fija", desde: "13", hasta: "23", color: "rojo" }] } } as never, "borrador");
    const removible = armarFiguras(p, { odonto: { protesis: [{ tipo: "removible", desde: "13", hasta: "23", color: "rojo" }] } } as never, "borrador");
    expect(fija).toHaveLength(1);
    for (const f of fija) expect(Object.keys(f)).not.toContain("discontinua");
    for (const f of removible) expect(f).toMatchObject({ discontinua: true });
  });

  it("vacío y sellado con la caja de existentes: No consigna y la raya", () => {
    // El contrato no fija el orden entre las dos: solo que están.
    const figuras = armarFiguras(plantillaSchema.parse(conLamina()), {}, "sellado");
    expect(figuras).toContainEqual({ tipo: "texto", pagina: 1, x: 252.21, y: 233.5, tamano: 10, texto: "No consigna", color: "tinta" });
    expect(figuras).toContainEqual({ tipo: "texto", pagina: 1, x: 465, y: 300, tamano: 10, texto: "—", color: "tinta" });
    expect(armarFiguras(plantillaSchema.parse(conLamina()), {}, "borrador")).toEqual([]);
  });

  it("sin odontograma o sin lámina no hay figuras", () => {
    const conducto = plantillaPorId("consentimiento-tratamiento-conducto") as Plantilla;
    expect(armarFiguras(conducto, {}, "sellado")).toEqual([]);
    expect(armarFiguras(plantillaCon(TABLA.texto[0].campo), { odonto: { existentes: 3 } } as never, "sellado")).toEqual([]);
  });
});

describe("las casillas de a un carácter (§7)", () => {
  const zona: Zona = { id: "matricula", pagina: 1, x: 100, y: 50, ancho: 72, casillas: { cantidad: 6, paso: 12 }, texto: "{{matricula}}" } as Zona;
  const cerca = (lineas: { x: number; y: number; texto: string }[]) =>
    lineas.map((l) => ({ x: Math.round(l.x * 100) / 100, y: l.y, texto: l.texto }));

  it("un carácter por casilla, centrado, sin achicar", () => {
    // "1" mide 556: 5,56 pt a 10 → (12 − 5,56)/2 = 3,22 de margen.
    const c = componerZona(zona, "1234");
    expect(c.tamano).toBe(10);
    expect(c.desborda).toBe(false);
    expect(cerca(c.lineas)).toEqual([
      { x: 103.22, y: 50, texto: "1" },
      { x: 115.22, y: 50, texto: "2" },
      { x: 127.22, y: 50, texto: "3" },
      { x: 139.22, y: 50, texto: "4" },
    ]);
  });

  it("un espacio no escribe nada pero ocupa su casilla", () => {
    expect(cerca(componerZona(zona, "12 4").lineas)).toEqual([
      { x: 103.22, y: 50, texto: "1" },
      { x: 115.22, y: 50, texto: "2" },
      { x: 139.22, y: 50, texto: "4" },
    ]);
  });

  it("con su tamaño, y por rune (una Ñ es un carácter)", () => {
    // W = 944 → 11,328 a 12 → x = 100 + 0,336; Ñ = 722 → 8,664 → 112 + 1,668.
    const c = componerZona({ ...zona, tamano: 12 }, "WÑ");
    expect(c.tamano).toBe(12);
    expect(cerca(c.lineas)).toEqual([
      { x: 100.34, y: 50, texto: "W" },
      { x: 113.67, y: 50, texto: "Ñ" },
    ]);
  });

  it("más caracteres que casillas desborda, y se escriben las que hay", () => {
    const c = componerZona(zona, "1234567");
    expect(c.desborda).toBe(true);
    expect(c.lineas.map((l) => l.texto)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(c.tamano).toBe(10);
  });

  const conMatricula = (z: Zona): Plantilla => {
    const p = plantillaCon({ tipo: "texto", id: "matricula", etiqueta: "Matrícula" } as Campo);
    p.lamina = {
      paginas: [{ ancho: 595, alto: 842 }],
      zonas: [z],
      firmas: [{ rol: "profesional", pagina: 1, x: 300, y: 790, ancho: 150, alto: 40 }],
    };
    return p;
  };

  it("vacía: nada en un borrador; terminada, una raya en x (o lo que la zona diga)", () => {
    const [borrador] = armarLamina(conMatricula(zona), {}, { fecha: "2026-10-03" }, "borrador");
    expect(borrador.lineas).toEqual([]);
    const [sellado] = armarLamina(conMatricula(zona), {}, { fecha: "2026-10-03" }, "sellado");
    expect(sellado.lineas).toEqual([{ x: 100, y: 50, texto: "—" }]);
    const [propio] = armarLamina(conMatricula({ ...zona, vacio: "s/d" }), {}, { fecha: "2026-10-03" }, "sellado");
    expect(propio.lineas).toEqual([{ x: 100, y: 50, texto: "s/d" }]);
  });

  it("cargada, la lámina la compone en casillas", () => {
    const [z] = armarLamina(conMatricula(zona), { matricula: "4321" }, { fecha: "2026-10-03" }, "sellado");
    expect(z.lineas.map((l) => l.texto)).toEqual(["4", "3", "2", "1"]);
  });

  it("el esquema: una sola línea, entre 1 y 40 casillas de paso positivo, dentro de la página", () => {
    expect(mensajes(conMatricula(zona))).toEqual([]);
    expect(mensajes(conMatricula({ ...zona, lineas: 1 }))).toEqual([]);
    expect(mensajes(conMatricula({ ...zona, lineas: 2 }))).not.toEqual([]);
    expect(mensajes(conMatricula({ ...zona, casillas: { cantidad: 0, paso: 12 } } as Zona))).not.toEqual([]);
    expect(mensajes(conMatricula({ ...zona, casillas: { cantidad: 41, paso: 12 } } as Zona))).not.toEqual([]);
    expect(mensajes(conMatricula({ ...zona, casillas: { cantidad: 6, paso: 0 } } as Zona))).not.toEqual([]);
    // 500 + 10·12 = 620 > 595.
    expect(mensajes(conMatricula({ ...zona, x: 500, ancho: 90, casillas: { cantidad: 10, paso: 12 } } as Zona))).not.toEqual([]);
  });
});

describe("el esquema del odontograma (§1, §5, §9)", () => {
  it("la plantilla de prueba es válida: el odontograma cuenta como presente en la lámina", () => {
    expect(mensajes(conLamina())).toEqual([]);
  });

  it("el campo: la leyenda es obligatoria y las opciones son las del contrato", () => {
    const sinLeyenda = conLamina();
    delete (sinLeyenda.secciones[0].campos[0] as Record<string, unknown>).leyenda;
    expect(mensajes(sinLeyenda)).not.toEqual([]);
    const leyenda = conLamina();
    (leyenda.secciones[0].campos[0] as Record<string, unknown>).leyenda = "adulta";
    expect(mensajes(leyenda)).not.toEqual([]);
    const denticion = conLamina();
    (denticion.secciones[0].campos[0] as Record<string, unknown>).denticion = "mixta";
    expect(mensajes(denticion)).not.toEqual([]);
  });

  it("sin lámina, un odontograma solo necesita estar en el cuerpo", () => {
    expect(mensajes(plantillaCon(TABLA.texto[0].campo))).toEqual([]);
  });

  it("sin su entrada en odontogramas, no aparece en la lámina", () => {
    const p = conLamina();
    p.lamina!.odontogramas = [];
    expect(mensajes(p)).not.toEqual([]);
  });

  it("el campo de la entrada existe y es un odontograma", () => {
    const inexistente = conLamina();
    inexistente.lamina!.odontogramas![0].campo = "otro";
    expect(mensajes(inexistente)).not.toEqual([]);

    const deTexto = conLamina();
    deTexto.secciones[0].campos.push({ tipo: "texto", id: "notas", etiqueta: "Notas" });
    deTexto.cuerpo.unshift({ t: "campo", campo: "notas" });
    deTexto.lamina!.zonas.push({ id: "notas", pagina: 1, x: 50, y: 700, ancho: 200, texto: "{{notas}}" });
    expect(mensajes(deTexto)).toEqual([]);
    deTexto.lamina!.odontogramas!.push({ ...copia(deTexto.lamina!.odontogramas![0]), campo: "notas" });
    expect(mensajes(deTexto)).not.toEqual([]);
  });

  it("un recuadro por pieza: ni de menos, ni repetido, ni de más", () => {
    const falta = conLamina();
    falta.lamina!.odontogramas![0].piezas.pop();
    expect(mensajes(falta)).not.toEqual([]);

    const repetida = conLamina();
    const piezas = repetida.lamina!.odontogramas![0].piezas;
    piezas[piezas.length - 1] = { ...piezas[0] };
    expect(mensajes(repetida)).not.toEqual([]);

    const deMas = conLamina();
    deMas.lamina!.odontogramas![0].piezas.push({ pieza: "55", x: 500, y: 500, lado: 20 });
    expect(mensajes(deMas)).not.toEqual([]);

    const inventada = conLamina();
    inventada.lamina!.odontogramas![0].piezas.push({ pieza: "99", x: 500, y: 500, lado: 20 });
    expect(mensajes(inventada)).not.toEqual([]);
  });

  it("todo recuadro queda dentro de la página", () => {
    const derecha = conLamina();
    derecha.lamina!.odontogramas![0].piezas[0] = { ...derecha.lamina!.odontogramas![0].piezas[0], x: 580 };
    expect(mensajes(derecha)).not.toEqual([]);
    const abajo = conLamina();
    abajo.lamina!.odontogramas![0].piezas[0] = { ...abajo.lamina!.odontogramas![0].piezas[0], y: 830 };
    expect(mensajes(abajo)).not.toEqual([]);
    const pagina = conLamina();
    pagina.lamina!.odontogramas![0].pagina = 2;
    expect(mensajes(pagina)).not.toEqual([]);
  });

  it("la caja de existentes está si y solo si el campo los pide", () => {
    const sinCaja = conLamina();
    delete sinCaja.lamina!.odontogramas![0].existentes;
    expect(mensajes(sinCaja)).not.toEqual([]);

    const sinPedirlos = conLamina();
    delete (sinPedirlos.secciones[0].campos[0] as Record<string, unknown>).existentes;
    expect(mensajes(sinPedirlos)).not.toEqual([]);
    delete sinPedirlos.lamina!.odontogramas![0].existentes;
    expect(mensajes(sinPedirlos)).toEqual([]);
  });

  it("la matrícula sin el tipo se puede precargar", () => {
    expect(PRECARGAS).toContain("profesional.matriculaNumero");
    const p = plantillaCon({ tipo: "texto", id: "matricula", etiqueta: "Matrícula", precarga: "profesional.matriculaNumero" } as Campo);
    expect(mensajes(p)).toEqual([]);
  });
});

describe("ladoDeCara: dónde va cada cara en el recuadro", () => {
  it.each([
    // V mira afuera: arriba en el maxilar superior, abajo en el inferior.
    ["V", "16", "arriba"],
    ["V", "55", "arriba"],
    ["V", "36", "abajo"],
    ["V", "85", "abajo"],
    ["L", "16", "abajo"],
    ["L", "46", "arriba"],
    // M mira a la línea media: a la derecha del recuadro en el lado derecho
    // del paciente (1, 4, 5, 8), a la izquierda en el izquierdo.
    ["M", "16", "derecha"],
    ["M", "46", "derecha"],
    ["M", "51", "derecha"],
    ["M", "21", "izquierda"],
    ["M", "36", "izquierda"],
    ["M", "65", "izquierda"],
    ["D", "16", "izquierda"],
    ["D", "26", "derecha"],
    ["D", "84", "izquierda"],
    ["D", "75", "derecha"],
    ["O", "11", "centro"],
    ["O", "47", "centro"],
  ] as const)("%s de la %s va %s", (cara, pieza, lado) => {
    expect(ladoDeCara(cara, pieza)).toBe(lado);
  });

  it("M y D de una pieza siempre quedan en lados opuestos, y V y L también", () => {
    for (const pieza of ["18", "11", "21", "28", "38", "31", "41", "48", "55", "65", "75", "85"]) {
      expect(new Set([ladoDeCara("M", pieza), ladoDeCara("D", pieza)])).toEqual(new Set(["izquierda", "derecha"]));
      expect(new Set([ladoDeCara("V", pieza), ladoDeCara("L", pieza)])).toEqual(new Set(["arriba", "abajo"]));
    }
  });
});

describe("cuándo está vacío: un valor con basura no es vacío y se valida", () => {
  const campo = TABLA.vacio[0].campo;
  it.each([
    ["un texto", "hola"],
    ["una pieza que no existe", { piezas: { "99": {} } }],
    ["caras como texto", { piezas: { "16": { caras: "V" } } }],
    ["protesis como objeto", { protesis: {} }],
  ] as const)("%s: no está vacío y la validación tolerante lo rechaza", (_, valor) => {
    expect(estaVacio(campo, valor)).toBe(false);
    expect(validarValores(plantillaCon(campo), { odonto: valor }, "tolerante")).toHaveLength(1);
  });

  it("vacío de verdad pasa la validación tolerante sin mensaje, y la estricta solo si es opcional", () => {
    const valor = { piezas: { "16": { caras: {}, marcas: {} } }, protesis: [] };
    expect(estaVacio(campo, valor)).toBe(true);
    expect(validarValores(plantillaCon(campo), { odonto: valor }, "tolerante")).toEqual([]);
    expect(validarValores(plantillaCon(campo), { odonto: valor }, "estricto")).toEqual([]);
    const obligatorio = { ...campo, requerido: true } as Campo;
    expect(validarValores(plantillaCon(obligatorio), { odonto: valor }, "estricto")).toHaveLength(1);
  });
});

describe("la marca {{campo:detalle}}", () => {
  const siNo = { tipo: "si_no", id: "medicacion", etiqueta: "¿Toma medicación?", detalle: { etiqueta: "¿Cuál?", cuando: "si" } } as Campo;
  const zona = { id: "med", pagina: 1, x: 60, y: 300, ancho: 300, texto: "{{medicacion:detalle}}" } as Zona;
  const conZona = (campo: Campo, z: Zona): Plantilla => {
    const p = plantillaCon(campo);
    p.lamina = {
      paginas: [{ ancho: 595, alto: 842 }],
      zonas: [z],
      firmas: [{ rol: "profesional", pagina: 1, x: 300, y: 790, ancho: 150, alto: 40 }],
    };
    return p;
  };
  const ctx = { fecha: "2026-10-03" };

  it("escribe solo la aclaración, sin el Sí y sin espacios de los costados", () => {
    const r = textoDeZona(zona, conZona(siNo, zona), { medicacion: { respuesta: "si", detalle: "  enalapril " } }, ctx, "sellado");
    expect(r).toEqual({ texto: "enalapril", vacia: false });
  });

  it("sin aclaración cuenta como vacío: nada en un borrador, No consigna terminado", () => {
    const p = conZona(siNo, zona);
    expect(textoDeZona(zona, p, { medicacion: { respuesta: "si", detalle: "   " } }, ctx, "borrador")).toEqual({ texto: "", vacia: true });
    expect(textoDeZona(zona, p, { medicacion: { respuesta: "no" } }, ctx, "borrador")).toEqual({ texto: "", vacia: true });
    expect(textoDeZona(zona, p, {}, ctx, "sellado").vacia).toBe(true);
    expect(textoDeZona(zona, p, {}, ctx, "sellado").texto).not.toBe("");
  });

  it("el esquema la acepta sobre un sí o no y la rechaza sobre cualquier otro tipo", () => {
    expect(mensajes(conZona(siNo, zona))).toEqual([]);
    const texto = { tipo: "texto", id: "medicacion", etiqueta: "Medicación" } as Campo;
    expect(mensajes(conZona(texto, zona))).toContain("la zona med pide la aclaración de un campo que no es sí o no: medicacion");
    const fecha = { tipo: "fecha", id: "medicacion", etiqueta: "Fecha" } as Campo;
    expect(mensajes(conZona(fecha, zona))).toContain("la zona med pide la aclaración de un campo que no es sí o no: medicacion");
    // Y al revés: una parte de fecha sobre un sí o no tampoco.
    const dia = { ...zona, texto: "{{medicacion:dia}}" } as Zona;
    expect(mensajes(conZona(siNo, dia))).toContain("la zona med parte un campo que no es fecha: medicacion");
  });
});
