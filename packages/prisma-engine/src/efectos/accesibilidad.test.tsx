import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { REGISTRO_MODULOS } from "../registro";
import type { ContextoPublico, ModuloBorrador } from "../tipos";
import type { EstiloMovimiento } from "./catalogo";

// Reglas de accesibilidad de los efectos (PP-1). Se prueban sobre los
// módulos reales, con el estilo de movimiento que les pone un efecto por
// defecto, porque así fue como se rompieron: ningún módulo pedía un efecto a
// mano y aun así la lista quedaba mal armada.

beforeAll(() => {
  // jsdom no trae matchMedia ni IntersectionObserver, y Motion los usa.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

function contexto(estiloMovimiento: EstiloMovimiento, contenido: Partial<ContextoPublico["contenido"]> = {}): ContextoPublico {
  return {
    nombreClinica: "Clínica de prueba",
    telefono: "351 555 0000",
    especialidades: [],
    estiloMovimiento,
    contenido: { bio: null, direccion: null, mostrarMapa: false, redesSociales: {}, estadisticas: {}, ...contenido },
    utils: {
      esUrlDeFotoSegura: () => true,
      hrefDeTelefono: (t) => `tel:${t}`,
      urlDeComoLlegar: (d) => `https://maps/${d}`,
      urlDeMapaEmbebido: (d) => `https://maps/embed/${d}`,
      urlDeRedSocial: (_red, valor) => (valor ? `https://red/${valor}` : null),
    },
  };
}

function modulo(tipo: string, config: Record<string, unknown> = {}, datosVista?: ModuloBorrador["datosVista"]): ModuloBorrador {
  return { clave: "c1", tipo, visible: true, config, ...(datosVista ? { datosVista } : {}) };
}

const HORARIOS = {
  abiertoAhora: false,
  nota: "",
  dias: [1, 2, 3, 4, 5, 6, 0].map((diaSemana) => ({ diaSemana: diaSemana as 0, cerrado: diaSemana === 0, franjas: diaSemana === 0 ? [] : [{ desde: "09:00", hasta: "13:00" }] })),
};

const EQUIPO = [
  { nombre: "Ana", fotoUrl: null, descripcion: "Directora" },
  { nombre: "Juan", fotoUrl: null, descripcion: null },
];

// Cada caso es un módulo con una lista y un efecto sobre sus ítems.
const CASOS: [string, ModuloBorrador, Partial<ContextoPublico["contenido"]>][] = [
  ["horarios compacto", modulo("horarios", { variante: "compacto" }), { horariosClinica: HORARIOS }],
  ["obras sociales", modulo("obras_sociales", { coberturas: ["osde", "pami"] }), {}],
  ["equipo en grilla", modulo("equipo", {}, { equipo: EQUIPO }), {}],
  ["equipo en carrusel", modulo("equipo", { variante: "carrusel-nombre" }, { equipo: EQUIPO }), {}],
];

describe("un efecto nunca se mete entre <ul> y <li> (H7)", () => {
  it.each(CASOS)("%s", async (_nombre, m, contenido) => {
    const seccion = REGISTRO_MODULOS[m.tipo as keyof typeof REGISTRO_MODULOS].seccion(m, 0, contexto("sereno", contenido));
    expect(seccion).not.toBeNull();
    const { container } = render(<>{seccion!.contenido}</>);
    // El efecto se carga con lazy(): recién cuenta cuando está montado.
    await waitFor(() => expect(container.querySelector("li [data-pp-efecto]")).not.toBeNull(), { timeout: 5000 });
    for (const lista of container.querySelectorAll("ul, ol")) {
      for (const hijo of lista.children) expect(hijo.tagName).toBe("LI");
    }
    for (const item of container.querySelectorAll("li")) {
      expect(["UL", "OL"]).toContain(item.parentElement?.tagName);
    }
  });
});

describe("el carrusel de Equipo se recorre con teclado (H8)", () => {
  it("la fila con scroll tiene foco propio y un nombre", () => {
    const m = modulo("equipo", { variante: "carrusel-nombre" }, { equipo: EQUIPO });
    const { container } = render(<>{REGISTRO_MODULOS.equipo.seccion(m, 0, contexto("quieto"))!.contenido}</>);
    const lista = container.querySelector("ul")!;
    expect(lista.getAttribute("tabindex")).toBe("0");
    expect(lista.getAttribute("aria-label")).toBeTruthy();
  });
});
