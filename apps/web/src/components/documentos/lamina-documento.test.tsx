import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  armarFiguras,
  armarLamina,
  COLORES_DE_FIGURA,
  plantillaPorId,
  plantillasVigentes,
  type Figura,
  type Plantilla,
} from "@dental-mirage/documentos-clinicos";
import { LaminaDocumento, paginasDeLaLamina } from "./lamina-documento";

describe("las láminas de los modelos", () => {
  // Una plantilla nueva sin sus páginas renderizadas se ve con el calco, no
  // con la hoja del Colegio (scripts/renderizar-originales.py): que no pase
  // sin que nadie se entere (Fase 5.2).
  it("cada documento vigente tiene sus páginas renderizadas, tantas como su lámina", () => {
    const sinPaginas = plantillasVigentes().filter((p) => p.lamina && paginasDeLaLamina(p) === null);
    expect(sinPaginas.map((p) => p.id)).toEqual([]);
  });
});

describe("LaminaDocumento", () => {
  const sedoanalgesia = plantillaPorId("consentimiento-sedoanalgesia") as Plantilla;
  const imagenes = plantillaPorId("consentimiento-toma-de-imagenes") as Plantilla;

  it("una casilla vacía se nombra con su campo y su opción, y lleva a ese campo", () => {
    const onElegir = vi.fn();
    render(
      <LaminaDocumento
        plantilla={sedoanalgesia}
        paginas={paginasDeLaLamina(sedoanalgesia)!}
        zonas={armarLamina(sedoanalgesia, {}, { fecha: "2026-09-29" }, "borrador")}
        editable={{ campoActivo: null, errores: {}, onElegir }}
        etiqueta="Tu documento"
      />,
    );
    const hospital = screen.getByRole("button", { name: "Completar: Lugar a realizarse la intervención: Hospital" });
    expect(screen.getByRole("button", { name: "Completar: Lugar a realizarse la intervención: Consultorio" })).toBeInTheDocument();
    hospital.click();
    expect(onElegir).toHaveBeenCalledWith("lugar_intervencion");
  });

  it("la casilla elegida se escribe con una X", () => {
    const { container } = render(
      <LaminaDocumento
        plantilla={sedoanalgesia}
        paginas={paginasDeLaLamina(sedoanalgesia)!}
        zonas={armarLamina(sedoanalgesia, { lugar_intervencion: "consultorio" }, { fecha: "2026-09-29" }, "borrador")}
        etiqueta="Tu documento"
      />,
    );
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toContain("X");
  });

  it("las zonas que solo llevan la fecha del documento no son tocables, y la escriben en partes", () => {
    const { container } = render(
      <LaminaDocumento
        plantilla={imagenes}
        paginas={paginasDeLaLamina(imagenes)!}
        zonas={armarLamina(imagenes, {}, { fecha: "2026-09-29" }, "borrador")}
        editable={{ campoActivo: null, errores: {}, onElegir: vi.fn() }}
        etiqueta="Tu documento"
      />,
    );
    const escrito = [...container.querySelectorAll("text")].map((t) => t.textContent);
    expect(escrito).toEqual(expect.arrayContaining(["29", "septiembre", "26"]));
    expect(container.querySelector("[data-zona='fecha_mes']")).toBeNull();
    expect(screen.getByRole("button", { name: "Completar: Medios y redes sociales" })).toBeInTheDocument();
  });
});

describe("LaminaDocumento con un odontograma (Fase 5.5)", () => {
  const historia = plantillaPorId("historia-clinica-general") as Plantilla;
  const paginaDelOdontograma = historia.lamina!.odontogramas![0].pagina;
  const ctx = { fecha: "2026-10-03" };
  const dibujar = (figuras: Figura[], extra: Partial<Parameters<typeof LaminaDocumento>[0]> = {}) =>
    render(
      <LaminaDocumento
        plantilla={historia}
        paginas={paginasDeLaLamina(historia)!}
        zonas={armarLamina(historia, {}, ctx, "borrador")}
        figuras={figuras}
        etiqueta="Tu documento"
        {...extra}
      />,
    );
  const enLaPagina = (container: HTMLElement, n: number) => container.querySelectorAll("figure")[n - 1];

  it("dibuja cada tipo de figura con su color, en su página", () => {
    const pagina = paginaDelOdontograma;
    const { container } = dibujar([
      { tipo: "poligono", pagina, puntos: [[10, 10], [20, 10], [15, 20]], relleno: "rojo" },
      { tipo: "contorno", pagina, puntos: [[30, 30], [40, 30], [40, 40], [30, 40]], color: "azul", grosor: 1.1 },
      { tipo: "linea", pagina, desde: [50, 50], hasta: [90, 50], color: "rojo", grosor: 1.4 },
      { tipo: "linea", pagina, desde: [50, 60], hasta: [90, 60], color: "azul", grosor: 1.4, discontinua: true },
      { tipo: "circulo", pagina, centro: [100, 100], radio: 5, color: "azul", grosor: 1.4 },
      { tipo: "texto", pagina, x: 120, y: 120, tamano: 9, texto: "No consigna", color: "tinta" },
    ]);
    const hoja = enLaPagina(container, pagina);
    const [relleno, contorno] = hoja.querySelectorAll("polygon");
    expect(relleno.getAttribute("points")).toBe("10,10 20,10 15,20");
    expect(relleno.getAttribute("fill")).toBe(COLORES_DE_FIGURA.rojo);
    expect(contorno.getAttribute("fill")).toBe("none");
    expect(contorno.getAttribute("stroke")).toBe(COLORES_DE_FIGURA.azul);
    expect(contorno.getAttribute("stroke-width")).toBe("1.1");
    const [fija, removible] = hoja.querySelectorAll("line");
    expect(fija.getAttribute("stroke-linecap")).toBe("round");
    expect(fija.getAttribute("stroke-dasharray")).toBeNull();
    expect(fija.getAttribute("x2")).toBe("90");
    expect(removible.getAttribute("stroke-dasharray")).toBe("3 2");
    expect(removible.getAttribute("stroke-linecap")).toBeNull();
    const circulo = hoja.querySelector("circle")!;
    expect([circulo.getAttribute("cx"), circulo.getAttribute("r"), circulo.getAttribute("stroke")]).toEqual(["100", "5", COLORES_DE_FIGURA.azul]);
    expect([...hoja.querySelectorAll("text")].map((t) => t.textContent)).toContain("No consigna");
  });

  it("una figura de otra página no se dibuja en esta", () => {
    const otra = paginaDelOdontograma === 1 ? 2 : 1;
    const { container } = dibujar([{ tipo: "circulo", pagina: otra, centro: [10, 10], radio: 3, color: "rojo", grosor: 1 }]);
    expect(enLaPagina(container, paginaDelOdontograma).querySelector("circle")).toBeNull();
    expect(enLaPagina(container, otra).querySelector("circle")).not.toBeNull();
  });

  it("dibuja lo que arma el paquete: caras, X, corona y prótesis", () => {
    const valores = {
      odontograma: {
        piezas: { "16": { caras: { O: "rojo" }, marcas: { corona: "azul" } }, "26": { marcas: { x: "rojo" } } },
        protesis: [{ tipo: "fija", desde: "13", hasta: "11", color: "azul" }],
        existentes: 30,
      },
    };
    const figuras = armarFiguras(historia, valores as never, "borrador");
    const { container } = dibujar(figuras);
    const hoja = enLaPagina(container, paginaDelOdontograma);
    const dibujadas = hoja.querySelectorAll("polygon, line, circle").length + [...hoja.querySelectorAll("text")].filter((t) => t.textContent === "30").length;
    expect(dibujadas).toBe(figuras.length);
    expect([...hoja.querySelectorAll("polygon")].some((p) => p.getAttribute("fill") === COLORES_DE_FIGURA.rojo)).toBe(true);
  });

  it("la caja del odontograma y la de los existentes llevan al campo", () => {
    const onElegir = vi.fn();
    dibujar([], { editable: { campoActivo: null, errores: {}, onElegir, valores: {} } });
    screen.getByRole("button", { name: "Completar: Odontograma" }).click();
    screen.getByRole("button", { name: "Completar: Odontograma: cantidad de dientes existentes" }).click();
    expect(onElegir).toHaveBeenNthCalledWith(1, "odontograma");
    expect(onElegir).toHaveBeenNthCalledWith(2, "odontograma");
  });

  it("vacío, activo y con error se distinguen en la caja", () => {
    const caja = (editable: Parameters<typeof LaminaDocumento>[0]["editable"]) => {
      const { unmount } = dibujar([], { editable });
      const clases = [
        screen.getByRole("button", { name: "Completar: Odontograma" }).className,
        screen.getByRole("button", { name: "Completar: Odontograma: cantidad de dientes existentes" }).className,
      ];
      unmount();
      return clases;
    };
    const base = { campoActivo: null, errores: {}, onElegir: vi.fn() };
    const [vacio, sinExistentes] = caja({ ...base, valores: {} });
    expect(vacio).toContain("bg-salvia/15");
    expect(sinExistentes).toContain("bg-salvia/15");
    // Con piezas pero sin el número: el dibujo está cargado y la caja del número, no.
    const [cargado, todaviaSinNumero] = caja({ ...base, valores: { odontograma: { piezas: { "16": { marcas: { x: "rojo" } } } } } });
    expect(cargado).not.toContain("bg-salvia/15");
    expect(todaviaSinNumero).toContain("bg-salvia/15");
    expect(caja({ ...base, campoActivo: "odontograma" })[0]).toContain("bg-salvia/20");
    expect(caja({ ...base, errores: { odontograma: "Hay una cara que no existe." } })[0]).toContain("ring-terracota-oscuro");
  });

  it("sin editable no hay cajas tocables", () => {
    dibujar([]);
    expect(screen.queryByRole("button", { name: /Odontograma/ })).toBeNull();
  });
});

// Fase 5.6a: una página con `escala` dibuja el original más chico, arriba y
// centrado, y lo de encima (texto, figuras, firmas y cajas para tocar) se
// lleva con él. La página 2 de la Historia clínica para PcD va al 93 %.
describe("LaminaDocumento con una página escalada (Fase 5.6a)", () => {
  const pcd = plantillaPorId("historia-clinica-pcd") as Plantilla;
  const sinEscala: Plantilla = {
    ...pcd,
    lamina: { ...pcd.lamina!, paginas: pcd.lamina!.paginas.map(({ ancho, alto }) => ({ ancho, alto })) },
  };
  const ctx = { fecha: "2026-10-04" };
  const dibujar = (plantilla: Plantilla) =>
    render(
      <LaminaDocumento
        plantilla={plantilla}
        paginas={paginasDeLaLamina(pcd)!}
        zonas={armarLamina(plantilla, { odontologo: "Lucía Gómez" }, ctx, "borrador")}
        editable={{ campoActivo: null, errores: {}, onElegir: vi.fn(), valores: {} }}
        etiqueta="Tu documento"
      />,
    );
  const enLaPagina = (container: HTMLElement, n: number) => container.querySelectorAll("figure")[n - 1];
  const pct = (v: string) => Number.parseFloat(v);

  it("la página escalada lleva su <g transform>; la que no, ninguno", () => {
    const { container } = dibujar(pcd);
    expect(pcd.lamina!.paginas[1].escala).toBe(0.93);
    expect(enLaPagina(container, 1).querySelector("g[transform]")).toBeNull();
    const g = enLaPagina(container, 2).querySelector("g[transform]")!;
    const m = /^translate\(([\d.]+) 0\) scale\(([\d.]+)\)$/.exec(g.getAttribute("transform")!);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeCloseTo((595.6 * (1 - 0.93)) / 2, 6);
    expect(Number(m![2])).toBe(0.93);
    // Lo escrito va adentro del grupo: el nombre del odontólogo en la aclaración.
    expect([...g.querySelectorAll("text")].map((t) => t.textContent)).toContain("Lucía Gómez");
  });

  it("la imagen del original va más chica, arriba y centrada", () => {
    const { container } = dibujar(pcd);
    const img1 = enLaPagina(container, 1).querySelector("img")!;
    const img2 = enLaPagina(container, 2).querySelector("img")!;
    expect(pct(img1.style.left)).toBe(0);
    expect(img1.style.width).toBe("100%");
    expect(pct(img2.style.left)).toBeCloseTo(3.5, 6);
    expect(pct(img2.style.width)).toBeCloseTo(93, 6);
    expect(pct(img2.style.height)).toBeCloseTo(93, 6);
  });

  it("sin escala no hay transform en ninguna página", () => {
    const { container } = dibujar(sinEscala);
    expect(container.querySelectorAll("g[transform]")).toHaveLength(0);
  });

  it("las cajas para tocar de la página escalada se corren con ella; las de la otra no", () => {
    const cajas = (plantilla: Plantilla) => {
      const { unmount } = dibujar(plantilla);
      const estilo = (nombre: string) => {
        const s = screen.getByRole("button", { name: nombre }).style;
        return { left: pct(s.left), top: pct(s.top), width: pct(s.width), height: pct(s.height) };
      };
      const r = {
        odontograma: estilo("Completar: Odontograma"),
        primera: estilo(screen.getAllByRole("button")[0].getAttribute("aria-label")!),
      };
      unmount();
      return r;
    };
    const escalada = cajas(pcd);
    const original = cajas(sinEscala);
    // El odontograma está en la página 2: (dx + e·x, e·y), y su tamaño por e.
    expect(escalada.odontograma.left).toBeCloseTo(3.5 + 0.93 * original.odontograma.left, 6);
    expect(escalada.odontograma.top).toBeCloseTo(0.93 * original.odontograma.top, 6);
    expect(escalada.odontograma.width).toBeCloseTo(0.93 * original.odontograma.width, 6);
    expect(escalada.odontograma.height).toBeCloseTo(0.93 * original.odontograma.height, 6);
    // La primera caja es de la página 1, sin escala: no se mueve.
    expect(escalada.primera).toEqual(original.primera);
  });
});
