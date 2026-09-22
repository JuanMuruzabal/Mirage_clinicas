import { describe, expect, it } from "vitest";
import type { ContenidoVersionPaginaPublica } from "@dental-mirage/shared-types";
import { hayCambios, hayCambiosSinPublicar, type Borrador } from "./borrador";

const borrador = (parcial: Partial<Borrador> = {}): Borrador => ({
  bio: "",
  tema: "",
  temaVariante: "",
  temaTipografia: "",
  fotoPortadaUrl: "",
  redes: {},
  mostrarMapa: false,
  direccionOverride: "",
  nombreSobrePortada: false,
  nombreColor: "",
  temaTokens: {},
  modulos: [],
  revision: 0,
  ...parcial,
});

const contenidoPublicado = (parcial: Partial<ContenidoVersionPaginaPublica> = {}): ContenidoVersionPaginaPublica => ({
  bio: null,
  tema: "",
  temaVariante: "",
  temaTipografia: "",
  redesSociales: {},
  mostrarMapa: false,
  nombreSobrePortada: false,
  nombreColor: "",
  temaTokens: {},
  modulos: [],
  ...parcial,
});

describe("hayCambios", () => {
  // Regresión real (PE-8): Pick<Borrador, Exclude<keyof Borrador, "revision">>
  // en la firma de un parámetro es un recorte de TIPO, no de VALOR — un
  // `{ ...b }` en runtime seguía trayendo `revision` igual, así que dos
  // borradores idénticos salvo por revision (uno recién releído del
  // servidor) siempre daban "hay cambios", aunque el contenido fuera
  // exactamente el mismo.
  it("dos borradores con el mismo contenido pero distinta revision NO cuentan como cambio", () => {
    const a = borrador({ bio: "Hola", revision: 0 });
    const b = borrador({ bio: "Hola", revision: 7 });
    expect(hayCambios(a, b)).toBe(false);
  });

  it("un contenido distinto sí cuenta como cambio, misma revision o no", () => {
    const a = borrador({ bio: "Hola" });
    const b = borrador({ bio: "Chau" });
    expect(hayCambios(a, b)).toBe(true);
  });
});

describe("hayCambiosSinPublicar", () => {
  it("sin ninguna versión publicada, cualquier borrador cuenta como cambio sin publicar", () => {
    expect(hayCambiosSinPublicar(borrador(), undefined)).toBe(true);
  });

  it("mismo contenido que lo publicado (bio null vs \"\", inclusive) no cuenta como cambio", () => {
    const guardado = borrador({ bio: "" });
    const publicado = contenidoPublicado({ bio: null });
    expect(hayCambiosSinPublicar(guardado, publicado)).toBe(false);
  });

  it("un módulo distinto al publicado sí cuenta como cambio sin publicar", () => {
    const guardado = borrador({ modulos: [{ clave: "c1", tipo: "sobre_nosotros", visible: true, config: {} }] });
    const publicado = contenidoPublicado({ modulos: [] });
    expect(hayCambiosSinPublicar(guardado, publicado)).toBe(true);
  });

  it("la clave del módulo (identidad de cliente) no participa de la comparación", () => {
    const guardado = borrador({ modulos: [{ clave: "cualquiera", tipo: "sobre_nosotros", visible: true, config: {} }] });
    const publicado = contenidoPublicado({ modulos: [{ tipo: "sobre_nosotros", orden: 0, visible: true, config: {} }] });
    expect(hayCambiosSinPublicar(guardado, publicado)).toBe(false);
  });
});
