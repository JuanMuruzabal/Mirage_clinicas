import { describe, expect, it } from "vitest";
import type { TramoDeProtesis, ValorOdontograma } from "@dental-mirage/documentos-clinicos";
import {
  agregarTramo,
  borrarPieza,
  borrarTodo,
  conflictoEnPieza,
  marcar,
  pintarCara,
  seSuperponeConOtro,
  alternarCara,
  alternarMarca,
  leerOperacion,
  OPERACION_VACIA,
  operarProtesis,
  ambosSirven,
  tramoDeLaOperacion,
  leerPiezaEscrita,
  soloDosDigitos,
  type AccionDeProtesis,
  type ContextoDeProtesis,
  type OperacionDeProtesis,
  conExistentes,
  filasDe,
  leerOdontograma,
  limpiar,
  moverFoco,
  quitarTramo,
  tramosEnPieza,
} from "./odontograma-edicion";

// La lógica pura del control del odontograma (Fase 5.5): lo que sale de
// cada gesto es un valor del contrato, sin claves vacías colgando.

describe("leer y limpiar el valor", () => {
  it("un valor roto arranca vacío en vez de romper el control", () => {
    expect(leerOdontograma("hola")).toEqual({});
    expect(leerOdontograma(null)).toEqual({});
    expect(leerOdontograma([1])).toEqual({});
    const bueno = { piezas: { "16": { caras: { O: "rojo" } } } };
    expect(leerOdontograma(bueno)).toBe(bueno);
  });

  it("limpiar saca piezas sin nada, prótesis vacías, y deja undefined si no queda nada", () => {
    expect(limpiar({ piezas: { "16": { caras: {}, marcas: {} } }, protesis: [] })).toBeUndefined();
    expect(limpiar({ piezas: { "16": { caras: {}, marcas: { x: "rojo" } } } })).toEqual({ piezas: { "16": { marcas: { x: "rojo" } } } });
    // Cero dientes existentes es un dato, no un vacío.
    expect(limpiar({ existentes: 0 })).toEqual({ existentes: 0 });
  });
});

describe("pintar caras y marcas", () => {
  it("una cara: el mismo color la despinta, el otro la cambia", () => {
    const pintado = alternarCara({}, "16", "O", "rojo");
    expect(pintado).toEqual({ piezas: { "16": { caras: { O: "rojo" } } } });
    expect(alternarCara(pintado!, "16", "O", "azul")).toEqual({ piezas: { "16": { caras: { O: "azul" } } } });
    expect(alternarCara(pintado!, "16", "O", "rojo")).toBeUndefined();
  });

  it("una marca no toca las caras de la misma pieza", () => {
    const v: ValorOdontograma = { piezas: { "16": { caras: { M: "azul" } } } };
    const marcado = alternarMarca(v, "16", "corona", "rojo");
    expect(marcado).toEqual({ piezas: { "16": { caras: { M: "azul" }, marcas: { corona: "rojo" } } } });
    expect(alternarMarca(marcado!, "16", "corona", "rojo")).toEqual(v);
  });

  it("los dientes existentes se ponen y se sacan", () => {
    expect(conExistentes({}, 28)).toEqual({ existentes: 28 });
    expect(conExistentes({ existentes: 28 }, undefined)).toBeUndefined();
  });
});

describe("las prótesis", () => {
  const fija: TramoDeProtesis = { tipo: "fija", desde: "13", hasta: "23", color: "rojo" };

  it("un tramo igual al revés reemplaza al anterior (cambiar el color no duplica)", () => {
    const uno = agregarTramo({}, fija);
    const otroColor = agregarTramo(uno!, { ...fija, desde: "23", hasta: "13", color: "azul" });
    expect(otroColor?.protesis).toEqual([{ tipo: "fija", desde: "23", hasta: "13", color: "azul" }]);
    // De otro tipo entre las mismas piezas, convive.
    expect(agregarTramo(uno!, { ...fija, tipo: "removible" })?.protesis).toHaveLength(2);
  });

  it("quitar el único tramo deja el valor vacío", () => {
    expect(quitarTramo({ protesis: [fija] }, 0)).toBeUndefined();
  });

  it("el fin de una prótesis: la misma pieza no la cierra, otra fila se rechaza, la misma fila sí", () => {
    const ctx = { valor: {}, denticion: "ambas" as const, tipo: "fija" as const, color: "rojo" as const };
    const fin = (hasta: string) => leerOperacion({ ...OPERACION_VACIA, paso: "fin", desde: "13", hasta }, ctx).hasta;
    expect(fin("13").error).toBe("Una prótesis une al menos dos piezas.");
    expect(fin("43").error).toBe("Una prótesis une piezas de la misma arcada.");
    expect(fin("53").error).toBe("Una prótesis une piezas de la misma arcada.");
    expect(fin("23")).toEqual({ pieza: "23", error: null });
  });

  it("dónde cae cada pieza de un tramo, de izquierda a derecha en el papel", () => {
    const filas = filasDe("ambas");
    const protesis = [{ ...fija, desde: "23", hasta: "13" }];
    expect(tramosEnPieza(filas, protesis, "13")[0].lugar).toBe("inicio");
    expect(tramosEnPieza(filas, protesis, "11")[0].lugar).toBe("medio");
    expect(tramosEnPieza(filas, protesis, "23")[0].lugar).toBe("fin");
    expect(tramosEnPieza(filas, protesis, "24")).toEqual([]);
    expect(tramosEnPieza(filas, protesis, "43")).toEqual([]);
    expect(tramosEnPieza(filas, undefined, "13")).toEqual([]);
    expect(tramosEnPieza(filas, protesis, "99")).toEqual([]);
  });
});

describe("las filas y el foco", () => {
  it("cada dentición tiene sus filas, y las temporarias van tres columnas adentro solo con ambas", () => {
    expect(filasDe("permanente").map((f) => f.id)).toEqual(["sup-perm", "inf-perm"]);
    expect(filasDe("temporaria").map((f) => [f.id, f.desde])).toEqual([
      ["sup-temp", 0],
      ["inf-temp", 0],
    ]);
    const ambas = filasDe("ambas");
    expect(ambas.map((f) => [f.id, f.piezas.length, f.desde])).toEqual([
      ["sup-perm", 16, 0],
      ["inf-perm", 16, 0],
      ["sup-temp", 10, 3],
      ["inf-temp", 10, 3],
    ]);
  });

  it("en el pediátrico las temporarias van arriba, y el foco pasa de ellas a las permanentes", () => {
    const filas = filasDe("ambas", true);
    expect(filas.map((f) => f.id)).toEqual(["sup-temp", "inf-temp", "sup-perm", "inf-perm"]);
    expect(filas[0].piezas[0]).toBe("55");
    expect(moverFoco(filas, "55", "ArrowUp")).toBe("55");
    expect(moverFoco(filas, "85", "ArrowDown")).toBe("15");
    expect(moverFoco(filas, "15", "ArrowUp")).toBe("85");
    expect(filasDe("temporaria", true).map((f) => f.id)).toEqual(["sup-temp", "inf-temp"]);
  });

  it("las flechas, Inicio y Fin", () => {
    const filas = filasDe("ambas");
    expect(moverFoco(filas, "18", "ArrowLeft")).toBe("18");
    expect(moverFoco(filas, "28", "ArrowRight")).toBe("28");
    expect(moverFoco(filas, "11", "ArrowRight")).toBe("21");
    expect(moverFoco(filas, "13", "Home")).toBe("18");
    expect(moverFoco(filas, "13", "End")).toBe("28");
    // Arriba en la primera fila se queda; abajo de la última, también.
    expect(moverFoco(filas, "18", "ArrowUp")).toBe("18");
    expect(moverFoco(filas, "85", "ArrowDown")).toBe("85");
    // De una permanente de la punta a la temporaria más cercana.
    expect(moverFoco(filas, "48", "ArrowDown")).toBe("55");
    expect(moverFoco(filas, "38", "ArrowDown")).toBe("65");
    // Y de la temporaria a la permanente de la misma columna.
    expect(moverFoco(filas, "55", "ArrowUp")).toBe("45");
  });

  it("una tecla que no mueve, o una pieza que no está, da null", () => {
    const filas = filasDe("permanente");
    expect(moverFoco(filas, "18", "a")).toBeNull();
    expect(moverFoco(filas, "55", "ArrowRight")).toBeNull();
  });
});

describe("el borrador y borrar todo", () => {
  it("borrarPieza saca caras y marcas de la pieza, y las prótesis que pasan por ella (pilar o intermedia)", () => {
    const v: ValorOdontograma = {
      piezas: { "12": { caras: { O: "rojo" }, marcas: { corona: "azul" } }, "26": { marcas: { x: "azul" } } },
      protesis: [
        { tipo: "fija", desde: "13", hasta: "11", color: "rojo" },
        { tipo: "removible", desde: "21", hasta: "23", color: "azul" },
        { tipo: "fija", desde: "43", hasta: "41", color: "azul" },
      ],
      existentes: 30,
    };
    // 12 es intermedia del primer tramo: se va. El de abajo, en la misma columna, queda.
    expect(borrarPieza(v, "12")).toEqual({
      piezas: { "26": { marcas: { x: "azul" } } },
      protesis: [
        { tipo: "removible", desde: "21", hasta: "23", color: "azul" },
        { tipo: "fija", desde: "43", hasta: "41", color: "azul" },
      ],
      existentes: 30,
    });
    // Como pilar, también.
    expect(borrarPieza(v, "23")?.protesis).toEqual([
      { tipo: "fija", desde: "13", hasta: "11", color: "rojo" },
      { tipo: "fija", desde: "43", hasta: "41", color: "azul" },
    ]);
    // Borrar la única cosa deja el valor vacío.
    expect(borrarPieza({ piezas: { "16": { marcas: { x: "rojo" } } } }, "16")).toBeUndefined();
    // Una pieza sin nada: el valor no cambia.
    expect(borrarPieza({ piezas: { "16": { caras: { O: "rojo" } } } }, "17")).toEqual({ piezas: { "16": { caras: { O: "rojo" } } } });
  });

  it("borrarTodo saca piezas y prótesis pero conserva los dientes existentes", () => {
    const v: ValorOdontograma = {
      piezas: { "16": { caras: { O: "rojo" } } },
      protesis: [{ tipo: "fija", desde: "13", hasta: "11", color: "rojo" }],
      existentes: 27,
    };
    expect(borrarTodo(v)).toEqual({ existentes: 27 });
    expect(borrarTodo({ ...v, existentes: undefined })).toBeUndefined();
    expect(borrarTodo({ existentes: 0 })).toEqual({ existentes: 0 });
  });
});

describe("la superposición de prótesis", () => {
  const v: ValorOdontograma = { protesis: [{ tipo: "fija", desde: "13", hasta: "11", color: "rojo" }] };

  it("comparte un pilar, queda adentro o la envuelve: se superpone", () => {
    expect(seSuperponeConOtro(v, { tipo: "fija", desde: "11", hasta: "21", color: "azul" })).toBe(true);
    expect(seSuperponeConOtro(v, { tipo: "removible", desde: "12", hasta: "12", color: "azul" })).toBe(true);
    expect(seSuperponeConOtro(v, { tipo: "removible", desde: "23", hasta: "15", color: "azul" })).toBe(true);
    // El mismo tramo, de otro tipo, también comparte piezas.
    expect(seSuperponeConOtro(v, { tipo: "removible", desde: "13", hasta: "11", color: "rojo" })).toBe(true);
  });

  it("vecinas, en otra fila, o el mismo tramo que lo reemplaza (aunque al revés): no", () => {
    expect(seSuperponeConOtro(v, { tipo: "fija", desde: "21", hasta: "23", color: "azul" })).toBe(false);
    expect(seSuperponeConOtro(v, { tipo: "fija", desde: "43", hasta: "41", color: "azul" })).toBe(false);
    expect(seSuperponeConOtro(v, { tipo: "fija", desde: "11", hasta: "13", color: "azul" })).toBe(false);
    expect(seSuperponeConOtro({}, { tipo: "fija", desde: "11", hasta: "13", color: "azul" })).toBe(false);
  });
});

describe("los conflictos de una pieza", () => {
  it("conflictoEnPieza: como pieza y como pilar, con los mensajes de la validación", () => {
    expect(conflictoEnPieza(undefined, "16")).toBeNull();
    expect(conflictoEnPieza({ piezas: { "16": { marcas: { x: "rojo" } } } }, "16")).toBeNull();
    expect(conflictoEnPieza({ piezas: { "16": { caras: { O: "rojo" }, marcas: { x: "rojo" } } } }, "16")).toBe(
      "La pieza 16 está ausente: no lleva prestaciones.",
    );
    expect(conflictoEnPieza({ piezas: { "26": { caras: { M: "azul" }, marcas: { x: "azul" } } } }, "26")).toBe(
      "La pieza 26 se va a extraer: no lleva prestaciones requeridas.",
    );
    // A extraer, con lo existente (rojo): coherente.
    expect(conflictoEnPieza({ piezas: { "26": { caras: { M: "rojo" }, marcas: { x: "azul", corona: "rojo" } } } }, "26")).toBeNull();
    const pilar = (x: "rojo" | "azul", color: "rojo" | "azul"): ValorOdontograma => ({
      piezas: { "13": { marcas: { x } } },
      protesis: [{ tipo: "fija", desde: "13", hasta: "11", color }],
    });
    expect(conflictoEnPieza(pilar("rojo", "rojo"), "13")).toBe("La pieza 13 está ausente: no puede ser pilar.");
    expect(conflictoEnPieza(pilar("azul", "azul"), "13")).toBe("La pieza 13 se va a extraer: no puede ser pilar.");
    expect(conflictoEnPieza(pilar("azul", "rojo"), "13")).toBeNull();
    // Una intermedia ausente es justo lo que reemplaza la prótesis.
    expect(conflictoEnPieza({ piezas: { "12": { marcas: { x: "rojo" } } }, protesis: pilar("rojo", "rojo").protesis }, "12")).toBeNull();
  });

  it("pintarCara aplica lo coherente y rechaza lo que choca, sin atajo", () => {
    expect(pintarCara({}, "16", "O", "rojo")).toEqual({ tipo: "aplicada", valor: { piezas: { "16": { caras: { O: "rojo" } } } } });
    const ausente: ValorOdontograma = { piezas: { "16": { marcas: { x: "rojo" } } } };
    expect(pintarCara(ausente, "16", "O", "rojo")).toEqual({ tipo: "conflicto", mensaje: "La pieza 16 está ausente: no lleva prestaciones." });
    const aExtraer: ValorOdontograma = { piezas: { "26": { marcas: { x: "azul" } } } };
    expect(pintarCara(aExtraer, "26", "M", "azul")).toEqual({
      tipo: "conflicto",
      mensaje: "La pieza 26 se va a extraer: no lleva prestaciones requeridas.",
    });
    expect(pintarCara(aExtraer, "26", "M", "rojo")).toEqual({
      tipo: "aplicada",
      valor: { piezas: { "26": { caras: { M: "rojo" }, marcas: { x: "azul" } } } },
    });
  });

  it("una corona sobre una ausente: conflicto, sin atajo", () => {
    expect(marcar({ piezas: { "16": { marcas: { x: "rojo" } } } }, "16", "corona", "rojo")).toEqual({
      tipo: "conflicto",
      mensaje: "La pieza 16 está ausente: no lleva prestaciones.",
    });
  });

  it("la X roja sobre una pieza con prestaciones ofrece Borrar y marcar ausente: borra todo y las prótesis que se apoyan", () => {
    const v: ValorOdontograma = {
      piezas: { "13": { caras: { O: "rojo", V: "azul" }, marcas: { corona: "azul" } } },
      protesis: [
        { tipo: "fija", desde: "13", hasta: "11", color: "rojo" },
        { tipo: "fija", desde: "23", hasta: "21", color: "rojo" },
      ],
    };
    const r = marcar(v, "13", "x", "rojo");
    if (r.tipo !== "conflicto") throw new Error("esperaba un conflicto");
    expect(r.mensaje).toBe("La pieza 13 tiene prestaciones marcadas: borralas antes de marcarla ausente.");
    expect(r.resolver?.etiqueta).toBe("Borrar y marcar ausente");
    expect(r.resolver?.valor).toEqual({
      piezas: { "13": { marcas: { x: "rojo" } } },
      protesis: [{ tipo: "fija", desde: "23", hasta: "21", color: "rojo" }],
    });
    expect(conflictoEnPieza(r.resolver?.valor, "13")).toBeNull();
  });

  it("la X azul ofrece Borrar y marcar para extraer: borra solo lo azul y las prótesis requeridas que se apoyan", () => {
    const v: ValorOdontograma = {
      piezas: { "13": { caras: { O: "rojo", V: "azul" }, marcas: { corona: "azul", sellador: "rojo" } } },
      protesis: [
        { tipo: "fija", desde: "13", hasta: "11", color: "azul" },
        { tipo: "fija", desde: "14", hasta: "13", color: "rojo" },
      ],
    };
    const r = marcar(v, "13", "x", "azul");
    if (r.tipo !== "conflicto") throw new Error("esperaba un conflicto");
    expect(r.mensaje).toBe("La pieza 13 tiene prestaciones requeridas marcadas: borralas antes de marcarla para extraer.");
    expect(r.resolver?.etiqueta).toBe("Borrar y marcar para extraer");
    expect(r.resolver?.valor).toEqual({
      piezas: { "13": { caras: { O: "rojo" }, marcas: { sellador: "rojo", x: "azul" } } },
      protesis: [{ tipo: "fija", desde: "14", hasta: "13", color: "rojo" }],
    });
  });

  it("una X sin nada que choque se aplica, y la misma X la saca", () => {
    const puesta = marcar({}, "16", "x", "rojo");
    expect(puesta).toEqual({ tipo: "aplicada", valor: { piezas: { "16": { marcas: { x: "rojo" } } } } });
    if (puesta.tipo !== "aplicada" || !puesta.valor) throw new Error("esperaba aplicada");
    expect(marcar(puesta.valor, "16", "x", "rojo")).toEqual({ tipo: "aplicada", valor: undefined });
    // Una X azul sobre lo existente (rojo) no choca.
    expect(marcar({ piezas: { "26": { caras: { O: "rojo" } } } }, "26", "x", "azul")).toEqual({
      tipo: "aplicada",
      valor: { piezas: { "26": { caras: { O: "rojo" }, marcas: { x: "azul" } } } },
    });
  });
});

// La prótesis en pasos (QA de la 5.5): elegir el inicio, empezar, elegir el
// fin, terminar y guardar. Ningún toque arma nada solo.
describe("la operación de prótesis, en pasos", () => {
  const ctxDe = (valor: ValorOdontograma = {}, color: "rojo" | "azul" = "rojo"): ContextoDeProtesis => ({
    valor,
    denticion: "ambas",
    tipo: "fija",
    color,
  });
  const ctx = ctxDe();
  const op = (paso: OperacionDeProtesis["paso"], desde = "", hasta = ""): OperacionDeProtesis => ({ paso, desde, hasta });
  /** Aplica una serie de acciones desde la operación vacía. */
  const correr = (c: ContextoDeProtesis, ...acciones: AccionDeProtesis[]) =>
    acciones.reduce((o, a) => operarProtesis(o, a, c), OPERACION_VACIA);

  it("en el inicio, tocar solo cambia la pieza elegida: otra pieza no arma nada", () => {
    const una = operarProtesis(OPERACION_VACIA, { tipo: "tocar", pieza: "13" }, ctx);
    expect(una).toEqual(op("inicio", "13"));
    const otra = operarProtesis(una, { tipo: "tocar", pieza: "23" }, ctx);
    expect(otra).toEqual(op("inicio", "23"));
  });

  it("el camino entero: empezar, elegir el fin, terminar, y el tramo que se guarda", () => {
    const empezada = correr(ctx, { tipo: "tocar", pieza: "13" }, { tipo: "empezar" });
    expect(empezada).toEqual(op("fin", "13"));
    const conFin = operarProtesis(empezada, { tipo: "tocar", pieza: "23" }, ctx);
    expect(conFin).toEqual(op("fin", "13", "23"));
    // Otro toque en el fin cambia el fin, no confirma.
    expect(operarProtesis(conFin, { tipo: "tocar", pieza: "22" }, ctx)).toEqual(op("fin", "13", "22"));
    const lista = operarProtesis(conFin, { tipo: "terminar" }, ctx);
    expect(lista).toEqual(op("confirmar", "13", "23"));
    expect(ambosSirven(lista, ctx)).toBe(true);
    expect(tramoDeLaOperacion(lista, { ...ctx, tipo: "removible", color: "azul" })).toEqual({
      tipo: "removible",
      desde: "13",
      hasta: "23",
      color: "azul",
    });
  });

  it("empezar sin pieza, o fuera del inicio, no hace nada; terminar sin fin válido, tampoco", () => {
    expect(operarProtesis(OPERACION_VACIA, { tipo: "empezar" }, ctx)).toBe(OPERACION_VACIA);
    const escrita99 = op("inicio", "99");
    expect(operarProtesis(escrita99, { tipo: "empezar" }, ctx)).toBe(escrita99);
    const enFin = op("fin", "13", "23");
    expect(operarProtesis(enFin, { tipo: "empezar" }, ctx)).toBe(enFin);
    const sinFin = op("fin", "13");
    expect(operarProtesis(sinFin, { tipo: "terminar" }, ctx)).toBe(sinFin);
    const mismaPieza = op("fin", "13", "13");
    expect(operarProtesis(mismaPieza, { tipo: "terminar" }, ctx)).toBe(mismaPieza);
    const enInicio = op("inicio", "13", "23");
    expect(operarProtesis(enInicio, { tipo: "terminar" }, ctx)).toBe(enInicio);
  });

  it("cancelar desde cualquier paso vuelve a la operación vacía", () => {
    for (const o of [op("inicio", "13"), op("fin", "13", "23"), op("confirmar", "13", "23")]) {
      expect(operarProtesis(o, { tipo: "cancelar" }, ctx)).toEqual(OPERACION_VACIA);
    }
  });

  it("retroceder (Escape) va de confirmar al fin, del fin al inicio, y en el inicio se queda", () => {
    const confirmar = op("confirmar", "13", "23");
    const fin = operarProtesis(confirmar, { tipo: "retroceder" }, ctx);
    expect(fin).toEqual(op("fin", "13", "23"));
    const inicio = operarProtesis(fin, { tipo: "retroceder" }, ctx);
    expect(inicio).toEqual(op("inicio", "13", "23"));
    expect(operarProtesis(inicio, { tipo: "retroceder" }, ctx)).toEqual(inicio);
  });

  it("el atajo: escribir Desde y Hasta válidos salta a confirmar, en cualquier orden", () => {
    const desde = (texto: string): AccionDeProtesis => ({ tipo: "escribir", campo: "desde", texto });
    const hasta = (texto: string): AccionDeProtesis => ({ tipo: "escribir", campo: "hasta", texto });
    expect(correr(ctx, desde("13"), hasta("23"))).toEqual(op("confirmar", "13", "23"));
    expect(correr(ctx, hasta("23"), desde("13"))).toEqual(op("confirmar", "13", "23"));
    // Mientras se escribe (un dígito) o con un fin que no sirve, se queda en el inicio.
    expect(correr(ctx, desde("13"), hasta("2"))).toEqual(op("inicio", "13", "2"));
    expect(correr(ctx, desde("13"), hasta("43"))).toEqual(op("inicio", "13", "43"));
  });

  it("cambiar Desde vuelve a elegir el inicio; cambiar Hasta ya confirmado vuelve al fin", () => {
    const confirmar = op("confirmar", "13", "23");
    expect(operarProtesis(confirmar, { tipo: "escribir", campo: "hasta", texto: "2" }, ctx)).toEqual(op("fin", "13", "2"));
    expect(operarProtesis(op("fin", "13"), { tipo: "escribir", campo: "hasta", texto: "22" }, ctx)).toEqual(op("fin", "13", "22"));
    // Desde cambiado con un Hasta que sigue sirviendo: el atajo vuelve a confirmar.
    expect(operarProtesis(confirmar, { tipo: "escribir", campo: "desde", texto: "12" }, ctx)).toEqual(op("confirmar", "12", "23"));
    expect(operarProtesis(confirmar, { tipo: "escribir", campo: "desde", texto: "1" }, ctx)).toEqual(op("inicio", "1", "23"));
  });

  it("tocar una pieza en confirmar vuelve al fin, con esa pieza como fin", () => {
    expect(operarProtesis(op("confirmar", "13", "23"), { tipo: "tocar", pieza: "24" }, ctx)).toEqual(op("fin", "13", "24"));
  });

  it("guardar revalida: si cambió el color, un pilar a extraer deja de servir para una prótesis requerida", () => {
    const valor: ValorOdontograma = { piezas: { "23": { marcas: { x: "azul" } } } };
    const rojo = ctxDe(valor, "rojo");
    const confirmar = correr(rojo, { tipo: "escribir", campo: "desde", texto: "13" }, { tipo: "escribir", campo: "hasta", texto: "23" });
    expect(confirmar.paso).toBe("confirmar");
    expect(ambosSirven(confirmar, rojo)).toBe(true);
    const azul = ctxDe(valor, "azul");
    expect(ambosSirven(confirmar, azul)).toBe(false);
    expect(leerOperacion(confirmar, azul).hasta.error).toBe("La pieza 23 se va a extraer: no puede ser pilar.");
  });

  describe("los errores, con el mensaje de la validación", () => {
    const conProtesis: ValorOdontograma = { protesis: [{ tipo: "fija", desde: "11", hasta: "13", color: "rojo" }] };

    it("empezar en una pieza de otra prótesis (pilar o intermedia): no empieza", () => {
      const c = ctxDe(conProtesis);
      const desde = (p: string) => leerOperacion(op("inicio", p), c).desde;
      expect(desde("12")).toEqual({ pieza: "12", error: "La pieza 12 ya es parte de la prótesis de 13 a 11." });
      expect(desde("11").error).toBe("La pieza 11 ya es parte de la prótesis de 13 a 11.");
      expect(operarProtesis(op("inicio", "12"), { tipo: "empezar" }, c)).toEqual(op("inicio", "12"));
      expect(desde("14")).toEqual({ pieza: "14", error: null });
    });

    it("terminar en una pieza de otra prótesis: no termina, y el atajo tampoco salta", () => {
      const c = ctxDe(conProtesis);
      expect(leerOperacion(op("fin", "14", "12"), c).hasta.error).toBe("La pieza 12 ya es parte de la prótesis de 13 a 11.");
      expect(operarProtesis(op("fin", "14", "12"), { tipo: "terminar" }, c)).toEqual(op("fin", "14", "12"));
      expect(operarProtesis(op("inicio", "14"), { tipo: "escribir", campo: "hasta", texto: "12" }, c).paso).toBe("inicio");
    });

    it("la otra arcada, la superposición y una sola pieza", () => {
      const c = ctxDe(conProtesis);
      const fin = (desde: string, hasta: string) => leerOperacion(op("fin", desde, hasta), c).hasta.error;
      expect(fin("14", "44")).toBe("Una prótesis une piezas de la misma arcada.");
      // De 14 a 21 envuelve a la de 13 a 11 sin pisar sus pilares.
      expect(fin("14", "21")).toBe("Esa prótesis se superpone con otra.");
      expect(fin("14", "14")).toBe("Una prótesis une al menos dos piezas.");
      expect(fin("15", "14")).toBeNull();
    });

    it("un pilar ausente, o a extraer en una prótesis requerida", () => {
      const valor: ValorOdontograma = { piezas: { "15": { marcas: { x: "rojo" } }, "24": { marcas: { x: "azul" } } } };
      const rojo = ctxDe(valor, "rojo");
      const azul = ctxDe(valor, "azul");
      expect(leerOperacion(op("inicio", "15"), rojo).desde.error).toBe("La pieza 15 está ausente: no puede ser pilar.");
      expect(leerOperacion(op("fin", "13", "15"), rojo).hasta.error).toBe("La pieza 15 está ausente: no puede ser pilar.");
      expect(leerOperacion(op("inicio", "24"), rojo).desde.error).toBeNull();
      expect(leerOperacion(op("inicio", "24"), azul).desde.error).toBe("La pieza 24 se va a extraer: no puede ser pilar.");
      expect(leerOperacion(op("fin", "21", "24"), azul).hasta.error).toBe("La pieza 24 se va a extraer: no puede ser pilar.");
      // Una intermedia ausente sí: es lo que reemplaza la prótesis.
      expect(ambosSirven(op("fin", "16", "13"), rojo)).toBe(true);
    });

    it("un número que no es de la dentición va como error sin pieza", () => {
      expect(leerOperacion(op("inicio", "99", "1"), ctx)).toEqual({
        desde: { pieza: null, error: "99 no es una pieza de este odontograma." },
        hasta: { pieza: null, error: null },
      });
      // Sin inicio válido, el fin se lee solo como pilar.
      expect(leerOperacion(op("inicio", "9", "43"), ctx).hasta).toEqual({ pieza: "43", error: null });
    });
  });
});

describe("una pieza escrita a mano", () => {
  it("nada mientras se escribe, la pieza si es de la dentición, o por qué no", () => {
    expect(leerPiezaEscrita("", "permanente")).toEqual({ pieza: null, error: null });
    expect(leerPiezaEscrita("1", "permanente")).toEqual({ pieza: null, error: null });
    expect(leerPiezaEscrita("16", "permanente")).toEqual({ pieza: "16", error: null });
    expect(leerPiezaEscrita("55", "permanente")).toEqual({ pieza: null, error: "55 no es una pieza de este odontograma." });
    expect(leerPiezaEscrita("55", "temporaria")).toEqual({ pieza: "55", error: null });
  });

  it("solo dígitos, y a lo sumo dos", () => {
    expect(soloDosDigitos("1a6")).toBe("16");
    expect(soloDosDigitos("123")).toBe("12");
    expect(soloDosDigitos("x")).toBe("");
  });
});
