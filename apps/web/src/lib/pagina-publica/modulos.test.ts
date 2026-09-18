import { describe, expect, it } from "vitest";
import type { PaginaPublicaModulo } from "@dental-mirage/shared-types";
import {
  TOPE_FOTOS_SUELTAS,
  anchoDeModulo,
  borradorDeModulos,
  configInicial,
  modulosAPayload,
  modulosParaMostrar,
  modulosPorDefecto,
  moverModulo,
  nuevaClave,
  puedeAgregar,
  subtipoDeConfig,
  textoDeConfig,
  listaDeConfig,
  type ModuloBorrador,
} from "./modulos";

const delServidor = (tipo: string, orden: number, visible = true, config?: Record<string, unknown>): PaginaPublicaModulo => ({
  id: `id-${tipo}-${orden}`,
  tipo,
  orden,
  visible,
  config,
});

const borrador = (tipo: string): ModuloBorrador => ({ clave: nuevaClave(), tipo, visible: true, config: configInicial(tipo) });

describe("borradorDeModulos", () => {
  it("una página sin módulos arranca con la estructura por defecto", () => {
    expect(borradorDeModulos([]).map((m) => m.tipo)).toEqual(["sobre_nosotros", "especialidades"]);
  });

  it("ordena por `orden` y conserva visibilidad y config", () => {
    const got = borradorDeModulos([
      delServidor("contacto", 2, false),
      delServidor("texto_libre", 0, true, { titulo: "Hola", texto: "x" }),
      delServidor("sobre_nosotros", 1),
    ]);
    expect(got.map((m) => m.tipo)).toEqual(["texto_libre", "sobre_nosotros", "contacto"]);
    expect(got[0].config).toEqual({ titulo: "Hola", texto: "x" });
    expect(got[2].visible).toBe(false);
    expect(got[0].clave).toBe("id-texto_libre-0");
  });
});

describe("modulosAPayload", () => {
  it("el orden es la posición en la lista, y la clave del cliente no viaja", () => {
    const payload = modulosAPayload([borrador("foto"), { ...borrador("contacto"), visible: false }]);
    expect(payload).toEqual([
      { tipo: "foto", orden: 0, visible: true, config: { fotoUrl: "", subtipo: "banner" } },
      { tipo: "contacto", orden: 1, visible: false, config: {} },
    ]);
    expect(payload[0]).not.toHaveProperty("clave");
  });
});

describe("modulosParaMostrar", () => {
  it("vacío y sin personalizar → estructura por defecto", () => {
    expect(modulosParaMostrar({ modulos: [], personalizada: false }).map((m) => m.tipo)).toEqual(["sobre_nosotros", "especialidades"]);
    expect(modulosParaMostrar({ modulos: [] }).length).toBe(2);
  });

  it("vacío pero personalizada → todo se ocultó a propósito, no se muestra nada", () => {
    expect(modulosParaMostrar({ modulos: [], personalizada: true })).toEqual([]);
  });

  it("con módulos, los muestra en orden y descarta los no visibles", () => {
    const got = modulosParaMostrar({
      modulos: [delServidor("contacto", 1), delServidor("sobre_nosotros", 0), delServidor("galeria", 2, false)],
      personalizada: true,
    });
    expect(got.map((m) => m.tipo)).toEqual(["sobre_nosotros", "contacto"]);
  });
});

describe("moverModulo", () => {
  it("mueve un elemento sin mutar la lista original", () => {
    const original = ["a", "b", "c", "d"];
    expect(moverModulo(original, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moverModulo(original, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(original).toEqual(["a", "b", "c", "d"]);
  });

  it("índices iguales o fuera de rango no hacen nada", () => {
    const original = ["a", "b"];
    expect(moverModulo(original, 1, 1)).toBe(original);
    expect(moverModulo(original, -1, 0)).toBe(original);
    expect(moverModulo(original, 0, 5)).toBe(original);
  });
});

describe("puedeAgregar", () => {
  it("los módulos únicos se agregan una sola vez", () => {
    const lista = [borrador("contacto")];
    expect(puedeAgregar(lista, "contacto")).toBe(false);
    expect(puedeAgregar(lista, "galeria")).toBe(true);
  });

  it("texto libre se puede repetir sin tope", () => {
    const lista = Array.from({ length: 20 }, () => borrador("texto_libre"));
    expect(puedeAgregar(lista, "texto_libre")).toBe(true);
  });

  it("las fotos sueltas se repiten hasta el tope de la página", () => {
    const casiLlena = Array.from({ length: TOPE_FOTOS_SUELTAS - 1 }, () => borrador("foto"));
    expect(puedeAgregar(casiLlena, "foto")).toBe(true);
    expect(puedeAgregar([...casiLlena, borrador("foto")], "foto")).toBe(false);
  });

  it("un tipo desconocido (o 'horarios', todavía sin editor) no se puede agregar", () => {
    expect(puedeAgregar([], "horarios")).toBe(false);
    expect(puedeAgregar([], "portada")).toBe(false);
  });
});

describe("anchoDeModulo", () => {
  it("especialidades, estadísticas y el retrato ocupan media grilla; el resto, toda", () => {
    expect(anchoDeModulo("especialidades", {})).toBe("medio");
    expect(anchoDeModulo("estadisticas", {})).toBe("medio");
    expect(anchoDeModulo("foto", { subtipo: "retrato" })).toBe("medio");
    expect(anchoDeModulo("foto", { subtipo: "banner" })).toBe("completo");
    expect(anchoDeModulo("galeria", {})).toBe("completo");
    expect(anchoDeModulo("contacto", {})).toBe("completo");
  });
});

describe("lectura tipada de la config", () => {
  it("un valor ausente o de otro tipo da el neutro, nunca rompe", () => {
    expect(textoDeConfig({ a: 3 }, "a")).toBe("");
    expect(textoDeConfig({}, "a")).toBe("");
    expect(listaDeConfig({ a: "x" }, "a")).toEqual([]);
    expect(listaDeConfig({ a: ["x", 3, "y"] }, "a")).toEqual(["x", "y"]);
    expect(subtipoDeConfig({})).toBe("banner");
    expect(subtipoDeConfig({ subtipo: "raro" })).toBe("banner");
    expect(subtipoDeConfig({ subtipo: "franja" })).toBe("franja");
  });
});

describe("modulosPorDefecto", () => {
  it("devuelve una lista nueva cada vez (el editor la muta por copia, pero no debe compartirse)", () => {
    expect(modulosPorDefecto()).not.toBe(modulosPorDefecto());
  });
});
