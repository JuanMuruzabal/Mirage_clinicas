import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { DocumentoResumen, EstadoDocumento } from "@dental-mirage/shared-types";
import { CHIP_DE_ESTADO, MODELO_RETIRADO, esAnexoSinFolio, nombreDeModelo, rotuloDeFolio } from "@/lib/documentos";
import { PastillaDeEstado } from "./pastilla-de-estado";
import { MigaDelDocumento, VinculosDelDocumento } from "./vinculos-del-documento";
import { sellado } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { TablaDeDocumentos } = await import("./tablas-de-documentos");

const ESTADOS: EstadoDocumento[] = ["borrador", "a_firmar", "para_imprimir", "sellado", "anulado", "abierto"];

describe("PastillaDeEstado", () => {
  it.each(ESTADOS)("%s: su rótulo y las clases de su estado, en tamaño chico", (estado) => {
    render(<PastillaDeEstado estado={estado}>Rótulo {estado}</PastillaDeEstado>);
    const pastilla = screen.getByText(`Rótulo ${estado}`);
    for (const clase of CHIP_DE_ESTADO[estado].split(" ")) expect(pastilla).toHaveClass(clase);
    expect(pastilla).toHaveClass("text-xs", "px-2", "rounded-full", "border");
    expect(pastilla).not.toHaveClass("text-sm");
  });

  it("grande: la del encabezado", () => {
    render(
      <PastillaDeEstado estado="abierto" grande>
        Abierto
      </PastillaDeEstado>,
    );
    const pastilla = screen.getByText("Abierto");
    expect(pastilla).toHaveClass("text-sm", "px-3", "py-1");
    expect(pastilla).not.toHaveClass("text-xs");
  });

  it("cada estado tiene su color: abierto no se confunde con sellado ni borrador", () => {
    const colores = new Set(ESTADOS.filter((e) => e !== "para_imprimir").map((e) => CHIP_DE_ESTADO[e]));
    expect(colores.size).toBe(ESTADOS.length - 1);
  });
});

describe("MigaDelDocumento", () => {
  const paciente = { id: "p1", nombre: "Ana", apellido: "Paz", dni: "1" } as never;

  it("un documento de la ficha: Documentos › paciente › este, sin nivel de historia", () => {
    render(<MigaDelDocumento documento={{ paciente, anexoDe: null }} titulo="Historia clínica general" />);
    const links = screen.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")]);
    expect(links).toEqual([
      ["Documentos", "/panel/documentos"],
      ["Ana Paz", "/panel/pacientes/p1/documentos"],
    ]);
    expect(screen.getByRole("navigation", { name: "Ubicación" })).toBeInTheDocument();
    expect(screen.getByText("Historia clínica general")).toHaveAttribute("aria-current", "page");
  });

  it("un anexo: el nivel de su historia con el nombre real de su modelo", () => {
    render(
      <MigaDelDocumento
        documento={{ paciente, anexoDe: { id: "h9", nombre: "Historia clínica general", estado: "sellado", folio: 3, folioMostrado: "3", fecha: "2026-09-27T14:05:00-03:00" } }}
        titulo="Anexo Nº 1 · Diagnóstico"
      />,
    );
    expect(screen.getByRole("link", { name: "Historia clínica general" })).toHaveAttribute("href", "/panel/documentos/h9");
    expect(screen.queryByText(MODELO_RETIRADO)).not.toBeInTheDocument();
  });
});

describe("nombreDeModelo y el folio", () => {
  it("un id interno pasa a 'Modelo retirado'; un nombre real queda igual", () => {
    expect(nombreDeModelo("anexo-odontopediatria")).toBe(MODELO_RETIRADO);
    expect(nombreDeModelo("historia-clinica-general")).toBe("Modelo retirado");
    expect(nombreDeModelo("anexo")).toBe(MODELO_RETIRADO);
    expect(nombreDeModelo("Historia clínica general")).toBe("Historia clínica general");
    expect(nombreDeModelo("Odontopediatría")).toBe("Odontopediatría");
    expect(nombreDeModelo("Anexo-de-prueba")).toBe("Anexo-de-prueba");
  });

  it("rotuloDeFolio y esAnexoSinFolio: 'Folio 3', 'Folio 3.1', 'Anexo Nº 1'", () => {
    expect(rotuloDeFolio("3")).toBe("Folio 3");
    expect(rotuloDeFolio("3.1")).toBe("Folio 3.1");
    expect(rotuloDeFolio("Anexo Nº 1")).toBe("Anexo Nº 1");
    expect(rotuloDeFolio(undefined)).toBeUndefined();
    expect(rotuloDeFolio("")).toBeUndefined();
    expect(esAnexoSinFolio("Anexo Nº 2")).toBe(true);
    expect(esAnexoSinFolio("3.2")).toBe(false);
  });
});

describe("el folio de un anexo en la tabla y en el vínculo", () => {
  const resumen = (extra: Partial<DocumentoResumen>): DocumentoResumen => ({ ...sellado(), ...extra });

  it("la tabla muestra '3.1' y 'Anexo Nº 2' tal como los manda la API", () => {
    render(
      <TablaDeDocumentos
        documentos={[resumen({ id: "a1", folio: undefined, folioMostrado: "3.1" }), resumen({ id: "a2", folio: undefined, folioMostrado: "Anexo Nº 2" })]}
        vacio="nada"
      />,
    );
    expect(screen.getByText("3.1")).toBeInTheDocument();
    expect(screen.getByText("Folio 3.1")).toBeInTheDocument();
    // En el anexo sin folio, la celda y el renglón del celular dicen lo mismo.
    expect(screen.getAllByText("Anexo Nº 2")).toHaveLength(2);
  });

  it("el vínculo nombra el folio x.y de un anexo y no inventa uno si la historia no lo tiene", () => {
    render(
      <VinculosDelDocumento
        documento={{
          anexoDe: null,
          anexos: [
            { id: "a1", nombre: "Anexo de prueba", estado: "sellado", folioMostrado: "3.1", fecha: "2026-09-28T09:00:00-03:00" },
            { id: "a2", nombre: "Anexo de prueba", estado: "borrador", folioMostrado: "Anexo Nº 2", fecha: "2026-09-29T11:30:00-03:00" },
          ],
        }}
      />,
    );
    const [uno, dos] = screen.getAllByRole("listitem");
    expect(uno).toHaveTextContent("Folio 3.1 · 28/09/2026 · 09:00");
    expect(within(dos).queryByText(/Folio/)).not.toBeInTheDocument();
    expect(within(dos).queryByText(/Anexo Nº 2/)).not.toBeInTheDocument();
  });
});
