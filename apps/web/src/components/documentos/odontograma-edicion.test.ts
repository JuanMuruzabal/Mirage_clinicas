import { describe, expect, it } from "vitest";
import type { TramoDeProtesis, ValorOdontograma } from "@dental-mirage/documentos-clinicos";
import {
  agregarTramo,
  alternarCara,
  alternarMarca,
  cerrarTramo,
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

  it("el segundo toque: la misma pieza cancela, otra fila avisa, la misma fila cierra", () => {
    expect(cerrarTramo("13", "13")).toEqual({ tipo: "cancelado" });
    expect(cerrarTramo("13", "43")).toEqual({ tipo: "otra-fila" });
    expect(cerrarTramo("13", "53")).toEqual({ tipo: "otra-fila" });
    expect(cerrarTramo("13", "23")).toEqual({ tipo: "tramo", desde: "13", hasta: "23" });
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
