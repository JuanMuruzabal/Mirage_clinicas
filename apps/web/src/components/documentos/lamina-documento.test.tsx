import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { armarLamina, plantillaPorId, plantillasVigentes, type Plantilla } from "@dental-mirage/documentos-clinicos";
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
  const ortodoncia = plantillaPorId("consentimiento-ortodoncia") as Plantilla;
  const imagenes = plantillaPorId("consentimiento-toma-de-imagenes") as Plantilla;

  it("una casilla vacía se nombra con su campo y su opción, y lleva a ese campo", () => {
    const onElegir = vi.fn();
    render(
      <LaminaDocumento
        plantilla={ortodoncia}
        paginas={paginasDeLaLamina(ortodoncia)!}
        zonas={armarLamina(ortodoncia, {}, { fecha: "2026-09-29" }, "borrador")}
        editable={{ campoActivo: null, errores: {}, onElegir }}
        etiqueta="Tu documento"
      />,
    );
    const si = screen.getByRole("button", { name: "Completar: Pido lo que quiero: Sí quiero atenderme" });
    expect(screen.getByRole("button", { name: "Completar: Pido lo que quiero: No quiero atenderme" })).toBeInTheDocument();
    si.click();
    expect(onElegir).toHaveBeenCalledWith("asentimiento");
  });

  it("la casilla elegida se escribe con una X", () => {
    const { container } = render(
      <LaminaDocumento
        plantilla={ortodoncia}
        paginas={paginasDeLaLamina(ortodoncia)!}
        zonas={armarLamina(ortodoncia, { asentimiento: "si_quiero" }, { fecha: "2026-09-29" }, "borrador")}
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
