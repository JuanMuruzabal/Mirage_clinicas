// El dibujo (Fase 5.6b): la validación con sus topes y su orden, cuándo está
// vacío, cómo se lleva al recuadro del papel, las reglas del esquema y la
// plantilla del Anexo de odontopediatría, que es la que lo usa.
//
// Los mensajes los comparte con Go: composicion/dibujo-invalido.json (que
// genera `pnpm documentos:generar`) los lleva al test de la API.
import { describe, expect, it } from "vitest";
import {
  armarCuerpo,
  armarFiguras,
  camposDe,
  DIBUJO_CONSIGNADO,
  dibujoVacio,
  errorDeDibujo,
  estaVacio,
  figurasDeDibujo,
  LIENZO_MAXIMO,
  LIENZO_MINIMO,
  MAXIMO_DE_PUNTOS,
  MAXIMO_DE_TRAZOS,
  PRECARGAS,
  plantillaPorId,
  plantillaSchema,
  validarLamina,
  validarValores,
  valorComoTexto,
  type Campo,
  type CampoDibujo,
  type DibujoDeLamina,
  type Plantilla,
  type Punto,
  type Valor,
  type Valores,
} from "./index";
import { textoCentrado } from "./odontograma";
import { dibujoDeEjemplo, valoresDeEjemplo } from "./ejemplo";
import tablaCompartida from "../../../apps/api/internal/documentos/testdata/dibujo.json";

const FORMA = "El dibujo no tiene la forma esperada.";
const LIENZO = "El lienzo tiene que medir entre 50 y 4000 de cada lado.";
const TRAZOS = "El dibujo puede tener hasta 300 trazos.";
const SIN_PUNTOS = "Hay un trazo sin puntos.";
const PUNTOS = "El dibujo puede tener hasta 20.000 puntos.";
const FUERA = "Hay un punto fuera del lienzo.";

const dibujo = (trazos: unknown, ancho: unknown = 400, alto: unknown = 200) => ({ ancho, alto, trazos });
/** `n` trazos de un punto cada uno. */
const trazosDeUnPunto = (n: number): Punto[][] => Array.from({ length: n }, () => [[1, 1]]);
/** Un trazo de `n` puntos, todos adentro del lienzo. */
const trazoDe = (n: number): Punto[] => Array.from({ length: n }, (_, i) => [i % 400, 1]);

describe("errorDeDibujo", () => {
  it("un dibujo bien formado, con o sin trazos, no tiene error", () => {
    expect(errorDeDibujo(dibujo([]))).toBeNull();
    expect(errorDeDibujo(dibujo([[[0, 0], [400, 200]], [[12.5, 33.33]]]))).toBeNull();
    expect(errorDeDibujo(dibujoDeEjemplo())).toBeNull();
  });

  it("la forma: un objeto con ancho, alto y trazos, ni una clave más ni una menos", () => {
    for (const valor of [null, undefined, "", "dibujo", 5, [], [1, 2, 3], true]) {
      expect(errorDeDibujo(valor), JSON.stringify(valor)).toBe(FORMA);
    }
    expect(errorDeDibujo({ ancho: 400, alto: 200 })).toBe(FORMA);
    expect(errorDeDibujo({ ancho: 400, trazos: [] })).toBe(FORMA);
    expect(errorDeDibujo({ alto: 200, trazos: [] })).toBe(FORMA);
    expect(errorDeDibujo({ ...dibujo([]), color: "rojo" })).toBe(FORMA);
    // Tres claves, pero no las tres esperadas.
    expect(errorDeDibujo({ ancho: 400, alto: 200, puntos: [] })).toBe(FORMA);
  });

  it("ancho y alto son números finitos y los trazos una lista", () => {
    expect(errorDeDibujo(dibujo([], "400"))).toBe(FORMA);
    expect(errorDeDibujo(dibujo([], 400, null))).toBe(FORMA);
    expect(errorDeDibujo(dibujo([], Number.NaN))).toBe(FORMA);
    expect(errorDeDibujo(dibujo([], 400, Number.POSITIVE_INFINITY))).toBe(FORMA);
    expect(errorDeDibujo(dibujo([], Number.NEGATIVE_INFINITY))).toBe(FORMA);
    expect(errorDeDibujo(dibujo({}))).toBe(FORMA);
    expect(errorDeDibujo(dibujo("trazos"))).toBe(FORMA);
  });

  it("el lienzo mide entre 50 y 4000 de cada lado, los dos topes incluidos", () => {
    expect(LIENZO_MINIMO).toBe(50);
    expect(LIENZO_MAXIMO).toBe(4000);
    for (const [ancho, alto] of [
      [50, 50],
      [4000, 4000],
      [50, 4000],
    ]) {
      expect(errorDeDibujo(dibujo([], ancho, alto)), `${ancho}×${alto}`).toBeNull();
    }
    for (const [ancho, alto] of [
      [49.99, 200],
      [400, 49],
      [4000.01, 200],
      [400, 4001],
      [0, 200],
      [-400, 200],
    ]) {
      expect(errorDeDibujo(dibujo([], ancho, alto)), `${ancho}×${alto}`).toBe(LIENZO);
    }
  });

  it("hasta 300 trazos: 300 pasa, 301 no", () => {
    expect(MAXIMO_DE_TRAZOS).toBe(300);
    expect(errorDeDibujo(dibujo(trazosDeUnPunto(300)))).toBeNull();
    expect(errorDeDibujo(dibujo(trazosDeUnPunto(301)))).toBe(TRAZOS);
  });

  it("hasta 20.000 puntos en total: 20.000 pasa, 20.001 no", () => {
    expect(MAXIMO_DE_PUNTOS).toBe(20000);
    expect(errorDeDibujo(dibujo([trazoDe(20000)]))).toBeNull();
    expect(errorDeDibujo(dibujo([trazoDe(20001)]))).toBe(PUNTOS);
    // El total es de todos los trazos juntos.
    expect(errorDeDibujo(dibujo([trazoDe(10000), trazoDe(10000)]))).toBeNull();
    expect(errorDeDibujo(dibujo([trazoDe(10000), trazoDe(10001)]))).toBe(PUNTOS);
  });

  it("un trazo sin puntos se rechaza", () => {
    expect(errorDeDibujo(dibujo([[]]))).toBe(SIN_PUNTOS);
    expect(errorDeDibujo(dibujo([[[1, 1]], []]))).toBe(SIN_PUNTOS);
  });

  it("cada punto es [x, y], dos números finitos", () => {
    for (const punto of [[1], [1, 2, 3], ["1", 2], [1, null], { x: 1, y: 2 }, 5, [Number.NaN, 1], [1, Number.POSITIVE_INFINITY]]) {
      expect(errorDeDibujo(dibujo([[punto]])), JSON.stringify(punto)).toBe(FORMA);
    }
    // Un trazo que no es una lista.
    expect(errorDeDibujo(dibujo(["trazo"]))).toBe(FORMA);
    expect(errorDeDibujo(dibujo([{ 0: [1, 1] }]))).toBe(FORMA);
  });

  it("los puntos van dentro del lienzo, los bordes incluidos", () => {
    expect(errorDeDibujo(dibujo([[[0, 0], [400, 200], [0, 200], [400, 0]]]))).toBeNull();
    for (const punto of [
      [-0.01, 10],
      [10, -0.01],
      [400.01, 10],
      [10, 200.01],
    ]) {
      expect(errorDeDibujo(dibujo([[[1, 1], punto]])), JSON.stringify(punto)).toBe(FUERA);
    }
  });

  describe("el orden: devuelve el PRIMER error", () => {
    it("la forma antes que el lienzo", () => {
      expect(errorDeDibujo({ ancho: 10, alto: 10, trazos: [], extra: 1 })).toBe(FORMA);
      expect(errorDeDibujo(dibujo("x", 10, 10))).toBe(FORMA);
    });

    it("el lienzo antes que la cantidad de trazos y que los puntos", () => {
      expect(errorDeDibujo(dibujo(trazosDeUnPunto(301), 10))).toBe(LIENZO);
      expect(errorDeDibujo(dibujo([[[9999, 9999]]], 10))).toBe(LIENZO);
    });

    it("la cantidad de trazos antes que un trazo vacío o un punto roto", () => {
      expect(errorDeDibujo(dibujo([[], ...trazosDeUnPunto(300)]))).toBe(TRAZOS);
      expect(errorDeDibujo(dibujo([[["x", 1]], ...trazosDeUnPunto(300)]))).toBe(TRAZOS);
    });

    it("trazo por trazo: un trazo vacío antes que los puntos de los siguientes", () => {
      expect(errorDeDibujo(dibujo([[[1, 1]], [], [[9999, 1]]]))).toBe(SIN_PUNTOS);
      // El punto fuera del primer trazo, antes que el trazo vacío del segundo.
      expect(errorDeDibujo(dibujo([[[9999, 1]], []]))).toBe(FUERA);
    });

    it("el total de puntos de un trazo se cuenta antes de mirar sus puntos", () => {
      expect(errorDeDibujo(dibujo([[[9999, 1], ...trazoDe(20000)]]))).toBe(PUNTOS);
      // Pero un punto roto de un trazo anterior gana: ese trazo se miró antes.
      expect(errorDeDibujo(dibujo([[[9999, 1]], trazoDe(20000)]))).toBe(FUERA);
    });

    it("dentro de un trazo, el primer punto malo decide", () => {
      expect(errorDeDibujo(dibujo([[[9999, 1], ["x", 1]]]))).toBe(FUERA);
      expect(errorDeDibujo(dibujo([[["x", 1], [9999, 1]]]))).toBe(FORMA);
    });
  });
});

interface CasoCompartido {
  nombre: string;
  valor?: unknown;
  generado?: { ancho: number; alto: number; trazos: number; puntos: number };
  vacio: boolean;
  mensaje: string | null;
}

// La tabla que comparte con dibujo_test.go: los mismos valores dan el mismo
// "vacío" y el mismo mensaje en la pantalla y en la API.
describe("la tabla compartida con Go (testdata/dibujo.json)", () => {
  const casos = (tablaCompartida as { casos: CasoCompartido[] }).casos;
  // El genograma del anexo: un campo dibujo opcional, como el de la tabla.
  const p = plantillaPorId("anexo-odontopediatria") as Plantilla;
  const campo = camposDe(p).find((c) => c.id === "genograma") as Campo;
  const valorDe = (c: CasoCompartido): unknown =>
    c.generado
      ? dibujo(
          Array.from({ length: c.generado.trazos }, () => Array.from({ length: c.generado!.puntos }, () => [1, 1])),
          c.generado.ancho,
          c.generado.alto,
        )
      : c.valor;

  it("tiene casos", () => {
    expect(casos.length).toBeGreaterThan(20);
  });

  for (const c of casos) {
    it(c.nombre, () => {
      const valor = valorDe(c);
      expect(estaVacio(campo, valor)).toBe(c.vacio);
      const error = validarValores(p, { genograma: valor as Valor }, "tolerante").find((e) => e.campo === "genograma");
      expect(error?.mensaje ?? null).toBe(c.mensaje);
      if (valor !== null) expect(errorDeDibujo(valor)).toBe(c.mensaje);
    });
  }
});

describe("dibujoVacio", () => {
  it("vacío es solo un dibujo bien formado sin trazos", () => {
    expect(dibujoVacio(dibujo([]))).toBe(true);
    expect(dibujoVacio(dibujo([[[1, 1]]]))).toBe(false);
  });

  it("lo mal formado no cuenta como vacío: la validación lo rechaza", () => {
    for (const valor of [null, undefined, "", [], {}, { trazos: [] }, dibujo([], 10), { ...dibujo([]), extra: 1 }, dibujo([], "400")]) {
      expect(dibujoVacio(valor), JSON.stringify(valor)).toBe(false);
    }
  });

  it("estaVacio de un campo dibujo: sin valor o sin trazos", () => {
    const campo = { tipo: "dibujo", id: "g", etiqueta: "Genograma" } as Campo;
    expect(estaVacio(campo, undefined)).toBe(true);
    expect(estaVacio(campo, null)).toBe(true);
    expect(estaVacio(campo, dibujo([]))).toBe(true);
    // Un "" o un [] no es un dibujo vacío: es basura y da su error.
    expect(estaVacio(campo, "")).toBe(false);
    expect(estaVacio(campo, [])).toBe(false);
    expect(estaVacio(campo, dibujo([[[1, 1]]]))).toBe(false);
  });
});

describe("figurasDeDibujo", () => {
  const campo: CampoDibujo = { tipo: "dibujo", id: "dibujo", etiqueta: "Genograma" };
  // Un recuadro de 200 × 100 en (10, 20).
  const recuadro: DibujoDeLamina = { campo: "dibujo", pagina: 2, x: 10, y: 20, ancho: 200, alto: 100 };

  it("un lienzo más ancho que el recuadro: la escala es la del ancho, y se centra de arriba abajo", () => {
    // 400 × 100 → escala min(200/400, 100/100) = 0,5; ocupa 200 × 50, y0 = 20 + 25.
    const figuras = figurasDeDibujo(recuadro, campo, dibujo([[[0, 0], [400, 100], [100, 40]]], 400, 100), "borrador");
    expect(figuras).toEqual([
      {
        tipo: "trazo",
        pagina: 2,
        puntos: [
          [10, 45],
          [210, 95],
          [60, 65],
        ],
        color: "tinta",
        grosor: 0.8,
      },
    ]);
  });

  it("un lienzo más alto: la escala es la del alto, y se centra de costado", () => {
    // 100 × 400 → escala min(2, 0,25) = 0,25; ocupa 25 × 100, x0 = 10 + 87,5.
    const [f] = figurasDeDibujo(recuadro, campo, dibujo([[[0, 0], [100, 400]]], 100, 400), "sellado");
    expect(f).toMatchObject({ tipo: "trazo", puntos: [[97.5, 20], [122.5, 120]] });
  });

  it("la misma escala en los dos ejes: el dibujo no se deforma", () => {
    const [f] = figurasDeDibujo(recuadro, campo, dibujo([[[0, 0], [300, 300]]], 300, 300), "borrador");
    if (f.tipo !== "trazo") throw new Error("se esperaba un trazo");
    const [[x0, y0], [x1, y1]] = f.puntos;
    expect(x1 - x0).toBeCloseTo(y1 - y0, 1);
  });

  it("redondea cada coordenada a dos decimales", () => {
    // 300 × 300 → escala 1/3; x0 = 10 + (200 − 100) / 2 = 60, y0 = 20.
    const [f] = figurasDeDibujo(recuadro, campo, dibujo([[[1, 1], [2, 2], [299.99, 0.01]]], 300, 300), "borrador");
    expect(f).toMatchObject({ puntos: [[60.33, 20.33], [60.67, 20.67], [160, 20]] });
    if (f.tipo !== "trazo") throw new Error("se esperaba un trazo");
    for (const [x, y] of f.puntos) {
      expect(Math.round(x * 100) / 100).toBe(x);
      expect(Math.round(y * 100) / 100).toBe(y);
    }
  });

  it("un trazo de un solo punto es una figura de un punto; cada trazo, una figura, en orden", () => {
    const figuras = figurasDeDibujo(recuadro, campo, dibujo([[[200, 50]], [[0, 0], [10, 10]]], 400, 100), "borrador");
    expect(figuras).toHaveLength(2);
    expect(figuras[0]).toMatchObject({ tipo: "trazo", puntos: [[110, 70]] });
    expect(figuras[1]).toMatchObject({ tipo: "trazo", puntos: [[10, 45], [15, 50]] });
  });

  it("vacío en un borrador no dibuja nada; terminado, dice No consigna en el medio del recuadro", () => {
    for (const valor of [undefined, null, dibujo([])]) {
      expect(figurasDeDibujo(recuadro, campo, valor, "borrador")).toEqual([]);
      const figuras = figurasDeDibujo(recuadro, campo, valor, "sellado");
      expect(figuras).toEqual([textoCentrado(2, "No consigna", 10, 10, 200, 73.5, "tinta")]);
      expect(figuras[0]).toMatchObject({ tipo: "texto", pagina: 2, y: 73.5, tamano: 10, texto: "No consigna", color: "tinta" });
    }
  });

  it("un valor roto no dibuja nada, ni siquiera No consigna", () => {
    for (const modo of ["borrador", "sellado"] as const) {
      expect(figurasDeDibujo(recuadro, campo, dibujo([[[9999, 1]]]), modo)).toEqual([]);
      expect(figurasDeDibujo(recuadro, campo, "basura", modo)).toEqual([]);
    }
  });
});

describe("armarFiguras con dibujos", () => {
  const conDibujo = (dibujos: DibujoDeLamina[] | undefined, campos: Campo[]): Plantilla =>
    ({
      id: "x",
      version: 1,
      nombre: "x",
      tipo: "anexo",
      descripcion: "x",
      fuente: { nombre: "x", url: "https://example.com" },
      secciones: [{ id: "s", titulo: "S", campos }],
      cuerpo: [{ t: "firmas" }],
      firmas: [],
      lamina: { paginas: [{ ancho: 595, alto: 842 }], zonas: [], firmas: [], ...(dibujos ? { dibujos } : {}) },
    }) as unknown as Plantilla;
  const genograma = { tipo: "dibujo", id: "g", etiqueta: "Genograma" } as Campo;
  const recuadro: DibujoDeLamina = { campo: "g", pagina: 1, x: 0, y: 0, ancho: 100, alto: 100 };

  it("sin recuadros no hay figuras de dibujo", () => {
    expect(armarFiguras(conDibujo(undefined, [genograma]), { g: dibujo([[[1, 1]]]) as Valor }, "sellado")).toEqual([]);
  });

  it("un recuadro de un campo que no es dibujo no compone nada (lo rechaza el esquema)", () => {
    const texto = { tipo: "texto", id: "g", etiqueta: "G" } as Campo;
    expect(armarFiguras(conDibujo([recuadro], [texto]), { g: "x" }, "sellado")).toEqual([]);
  });

  it("un recuadro de un dibujo compone sus trazos", () => {
    expect(armarFiguras(conDibujo([recuadro], [genograma]), { g: dibujo([[[1, 1]]], 100, 100) as Valor }, "sellado")).toEqual([
      { tipo: "trazo", pagina: 1, puntos: [[1, 1]], color: "tinta", grosor: 0.8 },
    ]);
  });
});

describe("el valor de un dibujo en el texto y en la validación", () => {
  const campo = { tipo: "dibujo", id: "g", etiqueta: "Genograma" } as Campo;

  it("como texto, dice que el dibujo está en la hoja", () => {
    expect(DIBUJO_CONSIGNADO).toBe("Dibujo consignado en la hoja");
    expect(valorComoTexto(campo, dibujoDeEjemplo())).toBe(DIBUJO_CONSIGNADO);
  });

  it("validarValores devuelve el mensaje del dibujo, en los dos modos", () => {
    const p = plantillaPorId("anexo-odontopediatria") as Plantilla;
    for (const modo of ["tolerante", "estricto"] as const) {
      const errores = validarValores(p, { genograma: dibujo([[[9999, 1]]]) as unknown as Valor }, modo);
      expect(errores.find((e) => e.campo === "genograma")?.mensaje, modo).toBe(FUERA);
    }
    expect(validarValores(p, { genograma: dibujo([]) as unknown as Valor }, "tolerante")).toEqual([]);
  });
});

describe("las reglas del esquema para los dibujos", () => {
  const base = {
    id: "dibujo-esquema",
    version: 1,
    nombre: "Dibujo",
    tipo: "anexo",
    descripcion: "Un dibujo.",
    fuente: { nombre: "Tests", url: "https://example.com/modelo" },
    secciones: [
      {
        id: "s",
        titulo: "S",
        campos: [
          { tipo: "dibujo", id: "g", etiqueta: "Genograma" },
          { tipo: "texto", id: "t", etiqueta: "Texto" },
        ],
      },
    ],
    cuerpo: [{ t: "campo", campo: "g" }, { t: "campo", campo: "t" }, { t: "firmas" }],
    firmas: [{ rol: "profesional", etiqueta: "Profesional", requerida: true }],
  };
  const lamina = (dibujos: unknown[] | undefined, paginas: unknown[] = [{ ancho: 595, alto: 842 }]) => ({
    ...base,
    lamina: {
      paginas,
      zonas: [{ id: "t", pagina: 1, x: 10, y: 10, ancho: 100, texto: "{{t}}" }],
      firmas: [{ rol: "profesional", pagina: 1, x: 380, y: 800, ancho: 150, alto: 40 }],
      ...(dibujos ? { dibujos } : {}),
    },
  });
  const recuadro = { campo: "g", pagina: 1, x: 10, y: 100, ancho: 200, alto: 100 };
  function errores(p: unknown): string[] {
    const r = plantillaSchema.safeParse(p);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  }

  it("con un recuadro dentro de su página, la plantilla es válida", () => {
    expect(errores(lamina([recuadro]))).toEqual([]);
    // Justo en el borde.
    expect(errores(lamina([{ ...recuadro, x: 395, y: 742 }]))).toEqual([]);
  });

  it("sin lámina tampoco: un dibujo sin recuadro no tendría dónde verse", () => {
    expect(errores(base)).toEqual(["el dibujo g tiene que tener exactamente un recuadro en la lámina (tiene 0)"]);
  });

  it("un dibujo sin recuadro o con dos", () => {
    expect(errores(lamina(undefined))).toContain("el dibujo g tiene que tener exactamente un recuadro en la lámina (tiene 0)");
    expect(errores(lamina([recuadro, { ...recuadro, y: 300 }]))).toContain("el dibujo g tiene que tener exactamente un recuadro en la lámina (tiene 2)");
  });

  it("sin recuadro, el campo tampoco aparece en la lámina", () => {
    expect(errores(lamina(undefined))).toContain("el campo g no aparece en la lámina");
    expect(errores(lamina([recuadro]))).not.toContain("el campo g no aparece en la lámina");
  });

  it("un recuadro de un campo que no es dibujo, o que no existe", () => {
    expect(errores(lamina([recuadro, { ...recuadro, campo: "t" }]))).toContain("la lámina ubica un dibujo en un campo que no lo es: t");
    expect(errores(lamina([recuadro, { ...recuadro, campo: "nada" }]))).toContain("la lámina ubica un dibujo en un campo que no lo es: nada");
  });

  it("un recuadro en una página que no existe", () => {
    expect(errores(lamina([{ ...recuadro, pagina: 2 }]))).toContain("el dibujo g está en una página que no existe");
  });

  it("un recuadro que se sale de la página, a lo ancho o a lo alto", () => {
    expect(errores(lamina([{ ...recuadro, x: 395.01 }]))).toContain("el dibujo g se sale de la página");
    expect(errores(lamina([{ ...recuadro, y: 742.01 }]))).toContain("el dibujo g se sale de la página");
  });

  it("con la página escalada, el recuadro puede bajar a la franja libre", () => {
    const escalada = [{ ancho: 595, alto: 842, escala: 0.9 }];
    expect(errores(lamina([{ ...recuadro, y: 842 / 0.9 - 100 }], escalada))).toEqual([]);
    expect(errores(lamina([{ ...recuadro, y: 842 / 0.9 - 99 }], escalada))).toContain("el dibujo g se sale de la página");
  });

  it("el recuadro mismo: medidas positivas y sin claves de más", () => {
    expect(errores(lamina([{ ...recuadro, ancho: 0 }])).length).toBeGreaterThan(0);
    expect(errores(lamina([{ ...recuadro, alto: -1 }])).length).toBeGreaterThan(0);
    expect(errores(lamina([{ ...recuadro, color: "rojo" }])).length).toBeGreaterThan(0);
    expect(errores(lamina([])).length).toBeGreaterThan(0);
  });

  it("un campo dibujo no admite opciones de más", () => {
    const conPrecarga = { ...base, secciones: [{ id: "s", titulo: "S", campos: [{ tipo: "dibujo", id: "g", etiqueta: "G", minimo: 3 }] }] };
    expect(errores(conPrecarga).length).toBeGreaterThan(0);
  });
});

describe("el Anexo de odontopediatría", () => {
  const anexo = plantillaPorId("anexo-odontopediatria") as Plantilla;
  const campos = camposDe(anexo);
  const contexto = { fecha: "2026-10-04" };

  it("está en el registro, es un anexo y es válido", () => {
    expect(anexo).toBeDefined();
    expect(anexo).toMatchObject({ tipo: "anexo", version: 1 });
    expect(plantillaSchema.safeParse(anexo).success).toBe(true);
  });

  it("el genograma es un campo dibujo con un recuadro dentro de su página", () => {
    const genograma = campos.find((c) => c.id === "genograma");
    expect(genograma?.tipo).toBe("dibujo");
    const recuadros = anexo.lamina!.dibujos!.filter((d) => d.campo === "genograma");
    expect(recuadros).toHaveLength(1);
    const [r] = recuadros;
    const pagina = anexo.lamina!.paginas[r.pagina - 1];
    expect(r.x + r.ancho).toBeLessThanOrEqual(pagina.ancho);
    expect(r.y + r.alto).toBeLessThanOrEqual(pagina.alto / (pagina.escala ?? 1));
  });

  it("el odontograma tiene las dos denticiones con la leyenda pediátrica", () => {
    const odontogramas = campos.filter((c) => c.tipo === "odontograma");
    expect(odontogramas).toHaveLength(1);
    expect(odontogramas[0]).toMatchObject({ denticion: "ambas", leyenda: "pediatrica" });
    // Un recuadro por cada pieza de las dos denticiones.
    expect(anexo.lamina!.odontogramas![0].piezas).toHaveLength(52);
  });

  it("lo firman el representante legal y el profesional, los dos obligatorios", () => {
    expect(anexo.firmas.map((f) => [f.rol, f.requerida])).toEqual([
      ["representante", true],
      ["profesional", true],
    ]);
    expect(anexo.lamina!.firmas.map((f) => f.rol).sort()).toEqual(["profesional", "representante"]);
  });

  it("precarga la edad en años y en meses", () => {
    expect(PRECARGAS).toEqual(expect.arrayContaining(["paciente.edadAnios", "paciente.edadMeses"]));
    expect(campos.find((c) => c.precarga === "paciente.edadAnios")).toMatchObject({ tipo: "numero", min: 0 });
    expect(campos.find((c) => c.precarga === "paciente.edadMeses")).toMatchObject({ tipo: "numero", min: 0, max: 11 });
  });

  it("el ejemplo es válido, trae el genograma y entra en la lámina", () => {
    const valores = valoresDeEjemplo(anexo);
    expect(valores.genograma).toEqual(dibujoDeEjemplo());
    expect(validarValores(anexo, valores, "estricto")).toEqual([]);
    expect(validarLamina(anexo, valores, contexto)).toEqual([]);
  });

  it("el genograma del ejemplo se compone después del odontograma, dentro de su recuadro", () => {
    const figuras = armarFiguras(anexo, valoresDeEjemplo(anexo), "sellado");
    const trazos = figuras.filter((f) => f.tipo === "trazo");
    expect(trazos).toHaveLength(dibujoDeEjemplo().trazos.length);
    // Todos los trazos van al final.
    expect(figuras.slice(-trazos.length).every((f) => f.tipo === "trazo")).toBe(true);
    const r = anexo.lamina!.dibujos![0];
    for (const f of trazos) {
      if (f.tipo !== "trazo") continue;
      expect(f.pagina).toBe(r.pagina);
      for (const [x, y] of f.puntos) {
        expect(x).toBeGreaterThanOrEqual(r.x);
        expect(x).toBeLessThanOrEqual(r.x + r.ancho);
        expect(y).toBeGreaterThanOrEqual(r.y);
        expect(y).toBeLessThanOrEqual(r.y + r.alto);
      }
    }
  });

  it("el cuerpo lee el genograma: dibujado o No consigna", () => {
    const valores = valoresDeEjemplo(anexo);
    const conDibujo = JSON.stringify(armarCuerpo(anexo, valores, contexto, "sellado"));
    expect(conDibujo).toContain(DIBUJO_CONSIGNADO);
    const sinDibujo: Valores = { ...valores };
    delete sinDibujo.genograma;
    const figuras = armarFiguras(anexo, sinDibujo, "sellado");
    expect(figuras.filter((f) => f.tipo === "trazo")).toEqual([]);
    expect(figuras.filter((f) => f.tipo === "texto" && f.texto === "No consigna" && f.pagina === anexo.lamina!.dibujos![0].pagina).length).toBeGreaterThan(0);
    expect(JSON.stringify(armarCuerpo(anexo, sinDibujo, contexto, "sellado"))).not.toContain(DIBUJO_CONSIGNADO);
  });

  it("con valores largos, solo desbordan campos de texto: nunca una fecha, un número, una casilla, el odontograma o el genograma", () => {
    const LARGO = "Enjuagues con clorhexidina al 0,12 % dos veces por día durante siete días, después del cepillado. ".repeat(2);
    const largos: Valores = {};
    for (const c of campos) {
      if (c.tipo === "texto") largos[c.id] = `${c.etiqueta} de prueba`;
      else if (c.tipo === "texto_largo") largos[c.id] = LARGO;
    }
    const ejemplo = valoresDeEjemplo(anexo);
    const valores = { ...ejemplo, ...largos };
    const desbordan = validarLamina(anexo, valores, contexto).map((e) => e.campo);
    const tipos = new Set(desbordan.map((id) => campos.find((c) => c.id === id)?.tipo));
    for (const tipo of tipos) expect(["texto", "texto_largo"]).toContain(tipo);
    expect(desbordan).not.toContain("genograma");
    expect(desbordan).not.toContain("odontograma");
  });
});
