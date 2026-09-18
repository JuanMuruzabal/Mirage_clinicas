import { describe, expect, it } from "vitest";
import { COLORES_NOMBRE, COLOR_NOMBRE_POR_DEFECTO, colorDeNombre } from "./portada";
import { conNombrePropio, nombrePropioDeModulo } from "./modulos";

describe("colorDeNombre", () => {
  it("resuelve cada id del set", () => {
    for (const c of COLORES_NOMBRE) expect(colorDeNombre(c.id)).toBe(c);
  });

  it("vacío, nulo o desconocido caen al default en vez de romper", () => {
    const porDefecto = colorDeNombre(COLOR_NOMBRE_POR_DEFECTO);
    expect(porDefecto.id).toBe("blanco");
    for (const raro of ["", null, undefined, "fucsia", "#ff0000", "BLANCO"]) {
      expect(colorDeNombre(raro)).toBe(porDefecto);
    }
  });

  it("el velo acompaña al color: solo el negro va sobre uno claro", () => {
    expect(COLORES_NOMBRE.filter((c) => c.velo === "claro").map((c) => c.id)).toEqual(["negro"]);
  });

  it("cada color es un hex de 6 dígitos y los ids son únicos", () => {
    for (const c of COLORES_NOMBRE) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(COLORES_NOMBRE.map((c) => c.id)).size).toBe(COLORES_NOMBRE.length);
  });
});

describe("nombre propio de un módulo", () => {
  it("se lee recortado, y sin nombre da vacío", () => {
    expect(nombrePropioDeModulo({ nombre: "  Sala de espera " })).toBe("Sala de espera");
    expect(nombrePropioDeModulo({})).toBe("");
    expect(nombrePropioDeModulo({ nombre: 42 })).toBe("");
  });

  it("conNombrePropio pone la clave sin pisar el resto de la config ni mutar la original", () => {
    const original = { subtipo: "banner", fotoUrl: "/uploads/a.png" };
    const nueva = conNombrePropio(original, "Equipo");
    expect(nueva).toEqual({ subtipo: "banner", fotoUrl: "/uploads/a.png", nombre: "Equipo" });
    expect(original).not.toHaveProperty("nombre");
  });

  it("un nombre vacío o de solo espacios QUITA la clave", () => {
    expect(conNombrePropio({ nombre: "Equipo", subtipo: "banner" }, "")).toEqual({ subtipo: "banner" });
    expect(conNombrePropio({ nombre: "Equipo" }, "   ")).toEqual({});
  });
});
