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
