import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { z } from "zod";
import { DEFINICIONES_MODULOS, REGISTRO_MODULOS, seccionPublicaDe } from "./registro";
import { ESQUEMAS_MODULOS, tokensSchema } from "./schemas";
import { OPCIONES_TOKENS, TOKENS_POR_DEFECTO, resolverTokens, tokensDeConfig } from "./tokens";
import { VARIANTES_PORTADA } from "./portada";
import type { ContextoPublico, ModuloBorrador } from "./tipos";

// PE-2/PE-3: lo que se protege es que las tres descripciones de lo mismo no
// se separen — el meta.ts (lo que ofrece el editor), el esquema (lo que
// acepta el backend) y el catálogo de tokens —, y que un dato viejo o
// inválido nunca rompa la página.

function contexto(parcial: Partial<ContextoPublico> = {}): ContextoPublico {
  return {
    nombreClinica: "Clínica de prueba",
    telefono: null,
    especialidades: ["Ortodoncia"],
    contenido: { bio: "Somos una clínica", direccion: "Av. Colón 100", mostrarMapa: false, redesSociales: {}, estadisticas: {} },
    utils: {
      esUrlDeFotoSegura: (u) => u.startsWith("/uploads/"),
      hrefDeTelefono: (t) => `tel:${t}`,
      urlDeComoLlegar: (d) => `https://maps/${d}`,
      urlDeMapaEmbebido: (d) => `https://maps/embed/${d}`,
      urlDeRedSocial: () => null,
    },
    ...parcial,
  };
}

const modulo = (tipo: string, config: Record<string, unknown> = {}): ModuloBorrador => ({ clave: "c1", tipo, visible: true, config });

describe("variantes: meta.ts y esquema dicen lo mismo", () => {
  for (const def of DEFINICIONES_MODULOS) {
    it(`${def.tipo}: las variantes del editor son exactamente las que acepta el esquema`, () => {
      const esquema = ESQUEMAS_MODULOS[def.tipo] as z.ZodObject<z.ZodRawShape>;
      const campo = esquema.shape.variante as z.ZodOptional<z.ZodEnum<[string, ...string[]]>> | undefined;
      const delEsquema = campo ? campo.unwrap().options : [];
      expect(def.variantes.map((v) => v.id)).toEqual(delEsquema);
    });
  }

  it("la portada ofrece exactamente las variantes del token `portada`", () => {
    expect(VARIANTES_PORTADA.map((v) => v.id)).toEqual([...OPCIONES_TOKENS.portada]);
  });
});

describe("tokens", () => {
  it("los defaults son válidos para el esquema que valida el backend", () => {
    expect(tokensSchema.safeParse(TOKENS_POR_DEFECTO).success).toBe(true);
  });

  it("se resuelven: defaults ← tema ← lo elegido", () => {
    const t = resolverTokens({ forma: "recta", menu: "subrayado" }, { forma: "redonda" });
    expect(t.forma).toBe("redonda");
    expect(t.menu).toBe("subrayado");
    expect(t.densidad).toBe(TOKENS_POR_DEFECTO.densidad);
  });

  it("un valor fuera del catálogo o de otro tipo se ignora, no rompe", () => {
    expect(tokensDeConfig({ forma: "triangular", densidad: 3, menu: "barra", extra: "x" })).toEqual({ menu: "barra" });
    expect(tokensDeConfig(null)).toEqual({});
    expect(tokensDeConfig(["forma"])).toEqual({});
  });
});

describe("seccionPublicaDe: opciones de sección", () => {
  it("aplica fondo y alineación solo si el módulo los admite", () => {
    const s = seccionPublicaDe(modulo("sobre_nosotros", { fondoSeccion: "contraste", alineacion: "izquierda" }), 0, contexto());
    expect(s?.fondo).toBe("contraste");
    expect(s?.alineacion).toBe("izquierda");

    // La galería no ofrece alineación: la clave se ignora.
    const g = seccionPublicaDe(modulo("galeria", { fotoUrls: ["/uploads/a.jpg"], alineacion: "izquierda" }), 0, contexto());
    expect(g?.alineacion).toBeUndefined();
  });

  it("un valor inválido no se aplica", () => {
    const s = seccionPublicaDe(modulo("contacto", { fondoSeccion: "neon" }), 0, contexto());
    expect(s?.fondo).toBeUndefined();
  });

  it("un tipo desconocido no arma sección", () => {
    expect(seccionPublicaDe(modulo("horarios"), 0, contexto())).toBeNull();
  });
});

describe("variantes: una variante nunca deja un hueco", () => {
  it("'con foto' sin foto válida se dibuja como el texto centrado", () => {
    const sinFoto = seccionPublicaDe(modulo("sobre_nosotros", { variante: "con-foto", fotoUrl: "javascript:alert(1)" }), 0, contexto());
    const { container } = render(<>{sinFoto?.contenido}</>);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Somos una clínica");
  });

  it("el título público reemplaza al de siempre, en la sección y en el menú", () => {
    const s = seccionPublicaDe(modulo("especialidades", { tituloPublico: "Qué hacemos" }), 0, contexto());
    expect(s?.etiqueta).toBe("Qué hacemos");
    const { getByRole } = render(<>{s?.contenido}</>);
    expect(getByRole("heading").textContent).toBe("Qué hacemos");
  });

  it("estadísticas en franja ocupan toda la grilla", () => {
    expect(REGISTRO_MODULOS.estadisticas.ancho({ variante: "franja" })).toBe("completo");
    expect(REGISTRO_MODULOS.estadisticas.ancho({ variante: "inventada" })).toBe("medio");
  });
});
