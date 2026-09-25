import { describe, expect, it } from "vitest";
import { DEFINICIONES_MODULOS, REGISTRO_MODULOS, definicionDeModulo } from "./registro";
import { miniaturaDeModulo } from "./miniatura";

// El registro es el corazón de PE-1: el criterio de aceptación del plan es
// que sumar un módulo cueste tocar solo su carpeta. Estos tests fijan el
// contrato que editor-de-modulo.tsx/modulos-publicos.tsx (apps/web) dan por
// sentado — si algo acá cambia de forma incompatible, tiene que romper acá
// primero, no en un componente que lo consume a ciegas.

describe("REGISTRO_MODULOS", () => {
  it("trae los 14 módulos existentes, cada uno con su propio tipo", () => {
    for (const tipo of [
      "sobre_nosotros",
      "texto_libre",
      "especialidades",
      "foto",
      "galeria",
      "estadisticas",
      "contacto",
      "equipo",
      "horarios",
      "servicios",
      "preguntas_frecuentes",
      "obras_sociales",
      "llamado_accion",
      "video",
    ] as const) {
      expect(REGISTRO_MODULOS[tipo].tipo).toBe(tipo);
    }
  });

  it("cada definición trae Editor y seccion como funciones", () => {
    for (const def of DEFINICIONES_MODULOS) {
      expect(typeof def.Editor).toBe("function");
      expect(typeof def.seccion).toBe("function");
      expect(typeof def.configInicial).toBe("function");
      expect(typeof def.ancho).toBe("function");
    }
  });

  it("conserva el orden en que se ofrecen para agregar en el editor", () => {
    expect(DEFINICIONES_MODULOS.map((d) => d.tipo)).toEqual([
      "sobre_nosotros",
      "texto_libre",
      "especialidades",
      "foto",
      "galeria",
      "estadisticas",
      "contacto",
      "equipo",
      "horarios",
      "servicios",
      "preguntas_frecuentes",
      "obras_sociales",
      "llamado_accion",
      "video",
    ]);
  });
});

describe("definicionDeModulo", () => {
  it("un tipo desconocido (o estructural, como 'portada') no está en el registro", () => {
    expect(definicionDeModulo("portada")).toBeUndefined();
    expect(definicionDeModulo("turno")).toBeUndefined();
  });
});

describe("configInicial por módulo", () => {
  it("texto_libre, foto, galeria y estadisticas traen su forma inicial propia", () => {
    expect(REGISTRO_MODULOS.texto_libre.configInicial()).toEqual({ titulo: "", texto: "" });
    expect(REGISTRO_MODULOS.foto.configInicial()).toEqual({ fotoUrl: "", subtipo: "banner" });
    expect(REGISTRO_MODULOS.galeria.configInicial()).toEqual({ fotoUrls: [] });
    expect(REGISTRO_MODULOS.estadisticas.configInicial()).toEqual({ mostrar: ["pacientes_atendidos", "turnos_realizados"] });
  });

  it("sobre_nosotros, especialidades y contacto no tienen config propia", () => {
    expect(REGISTRO_MODULOS.sobre_nosotros.configInicial()).toEqual({});
    expect(REGISTRO_MODULOS.especialidades.configInicial()).toEqual({});
    expect(REGISTRO_MODULOS.contacto.configInicial()).toEqual({});
  });
});

describe("ancho por módulo", () => {
  it("especialidades y estadísticas ocupan media grilla; el resto, toda", () => {
    expect(REGISTRO_MODULOS.especialidades.ancho({})).toBe("medio");
    expect(REGISTRO_MODULOS.estadisticas.ancho({})).toBe("medio");
    expect(REGISTRO_MODULOS.sobre_nosotros.ancho({})).toBe("completo");
    expect(REGISTRO_MODULOS.texto_libre.ancho({})).toBe("completo");
    expect(REGISTRO_MODULOS.galeria.ancho({})).toBe("completo");
    expect(REGISTRO_MODULOS.contacto.ancho({})).toBe("completo");
  });

  it("una foto ocupa media grilla solo en formato retrato", () => {
    expect(REGISTRO_MODULOS.foto.ancho({ subtipo: "retrato" })).toBe("medio");
    expect(REGISTRO_MODULOS.foto.ancho({ subtipo: "banner" })).toBe("completo");
    expect(REGISTRO_MODULOS.foto.ancho({})).toBe("completo");
  });
});

describe("miniatura del catálogo (PP-6, H20)", () => {
  it("todo módulo tiene un dibujo para «Agregar sección»: su primera variante o su `miniatura`", () => {
    for (const d of DEFINICIONES_MODULOS) {
      const m = miniaturaDeModulo(d);
      expect(m.bloques.length, d.tipo).toBeGreaterThan(0);
      if (d.variantes.length === 0) expect(d.miniatura, `${d.tipo} no tiene variantes: necesita miniatura`).toBeDefined();
    }
  });

  it("con una variante pedida (la de una sección prearmada) dibuja esa", () => {
    const galeria = definicionDeModulo("galeria")!;
    expect(miniaturaDeModulo(galeria, "carrusel").id).toBe("carrusel");
    expect(miniaturaDeModulo(galeria, "no-existe").id).toBe(galeria.variantes[0].id);
  });
});
