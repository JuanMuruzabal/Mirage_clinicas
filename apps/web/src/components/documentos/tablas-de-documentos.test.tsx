import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { aFirmar, borrador, paraImprimir, sellado } from "./fixtures";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

beforeEach(() => vi.clearAllMocks());

const { TablaDeDocumentos, TablaPacientesConDocumentos, EstadoDeDocumento } = await import("./tablas-de-documentos");
const { DocumentosDeLaFicha } = await import("./documentos-de-la-ficha");

const resumen = (extra: Partial<DocumentoResumen> = {}): DocumentoResumen => ({ ...sellado(), ...extra });

describe("TablaPacientesConDocumentos", () => {
  it("nombre, DNI y cantidad; cada fila lleva al registro", () => {
    render(
      <TablaPacientesConDocumentos
        pacientes={[{ id: "pac-1", nombre: "Ana", apellido: "Paz", dni: "30111222", cantidad: 2, ultimo: "2026-09-27T14:06:00-03:00" }]}
      />,
    );
    expect(screen.getByRole("link", { name: "Ana Paz" })).toHaveAttribute("href", "/panel/pacientes/pac-1/documentos");
    expect(screen.getByText("30111222")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Último: 27/09/2026")).toBeInTheDocument();
  });

  it("vacía, lo dice", () => {
    render(<TablaPacientesConDocumentos pacientes={[]} />);
    expect(screen.getByText(/Todavía no hay documentos terminados/)).toBeInTheDocument();
  });
});

describe("TablaDeDocumentos", () => {
  it("el registro: folio, documento con su tipo, autor (con la marca de colega), huella y estado", () => {
    render(<TablaDeDocumentos documentos={[resumen(), resumen({ id: "doc-2", esMio: false, autorNombre: "Pedro Díaz", folio: 2, folioMostrado: "2" })]} vacio="nada" />);
    expect(screen.getAllByRole("link", { name: "Consentimiento informado: Tratamiento de conducto" })[0]).toHaveAttribute(
      "href",
      "/panel/documentos/doc-1",
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("(colega)")).toBeInTheDocument();
    // En una tabla, el estado es Borrador, Completado o Anulado (2026-10-05).
    // Va dos veces por fila: en su columna y, para el celular, debajo del
    // documento.
    expect(screen.getAllByText("Completado")).toHaveLength(4);
    // La huella abreviada en su columna, y la completa al pasar el mouse.
    expect(screen.getByRole("columnheader", { name: "Huella" })).toBeInTheDocument();
    const huellas = screen.getAllByText("a3f1c0de…0000");
    expect(huellas[0]).toHaveAttribute("title", "a3f1c0de9b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a392817060000");
  });

  it("un tipo desconocido deja el nombre solo, y sin huella va una raya", () => {
    render(<TablaDeDocumentos documentos={[resumen({ tipo: "otra_cosa", plantillaNombre: "Algo nuevo", hashContenido: undefined })]} vacio="nada" />);
    expect(screen.getByRole("link", { name: "Algo nuevo" })).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("en curso: con el paciente, sin folio ni huella", () => {
    render(<TablaDeDocumentos documentos={[borrador()]} conPaciente vacio="nada" />);
    expect(screen.getByText("Ana Paz")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Consentimiento informado: Tratamiento de conducto" })).toBeInTheDocument();
    expect(screen.queryByText("Folio")).not.toBeInTheDocument();
    expect(screen.queryByText("Huella")).not.toBeInTheDocument();
    // En su columna y, para el celular, debajo del documento.
    expect(screen.getAllByText("Borrador")).toHaveLength(2);
  });

  it("vacía, dice lo que se le pida", () => {
    render(<TablaDeDocumentos documentos={[]} vacio="Todavía no hay documentos para este paciente." />);
    expect(screen.getByText("Todavía no hay documentos para este paciente.")).toBeInTheDocument();
  });

  it("cada estado tiene su chip", () => {
    const { rerender } = render(<EstadoDeDocumento estado="a_firmar" />);
    expect(screen.getByText("Esperando firmas")).toBeInTheDocument();
    rerender(<EstadoDeDocumento estado="anulado" />);
    expect(screen.getByText("Anulado")).toBeInTheDocument();
    rerender(<EstadoDeDocumento estado="para_imprimir" />);
    expect(screen.getByText("Listo para imprimir o descargar")).toBeInTheDocument();
    expect(screen.queryByText("Listo para imprimir")).not.toBeInTheDocument();
  });

  it("el chip del encabezado va siempre en una línea", () => {
    render(<EstadoDeDocumento estado="para_imprimir" />);
    const chip = screen.getByText("Listo para imprimir o descargar");
    expect(chip).toHaveClass("whitespace-nowrap", "rounded-full");
  });

  it("la celda de estado de la tabla dice Completado, corto y en una línea", () => {
    render(<TablaDeDocumentos documentos={[paraImprimir()]} vacio="nada" />);
    // En su columna y, para el celular, debajo del documento.
    const chips = screen.getAllByText("Completado");
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.closest("td")).not.toBeNull();
      expect(chip).toHaveClass("whitespace-nowrap");
    }
    expect(screen.queryByText("Listo para imprimir o descargar")).not.toBeInTheDocument();
  });
});

describe("TablaDeDocumentos anidada: los anexos de cada historia (5.6b)", () => {
  it("un anexo de una historia que no se ve va bajo su rótulo; «Anexo sin historia» es solo el que no tiene", () => {
    const historia = resumen({ id: "h1", tipo: "historia_clinica", plantillaNombre: "Historia clínica general" });
    const anexo = (extra: Partial<DocumentoResumen>) => resumen({ tipo: "anexo", plantillaNombre: "Anexo de prueba", ...extra });
    render(
      <TablaDeDocumentos
        anidada
        documentos={[
          anexo({ id: "a-sin", anexoDe: null }),
          anexo({ id: "a-oculta", anexoDe: null, historiaNoVisible: true }),
          historia,
          anexo({ id: "a-suyo", anexoDe: { id: "h1", nombre: "Historia clínica general", estado: "sellado", folio: 3, folioMostrado: "3", fecha: "2026-09-27T14:05:00-03:00" } }),
        ]}
        vacio="nada"
      />,
    );
    const filas = screen.getAllByRole("row").slice(1).map((f) => f.textContent ?? "");
    expect(filas).toHaveLength(5);
    expect(filas[0]).toContain("Historia clínica general");
    expect(filas[0]).not.toContain("Historia clínica: Historia clínica");
    expect(filas[1]).toContain("Anexo de prueba");
    expect(filas[2]).toBe("Historia de otro profesional, todavía sin terminar");
    expect(filas[3]).toContain("Anexo de prueba");
    expect(filas[3]).not.toContain("Anexo sin historia");
    expect(filas[4]).toContain("Anexo sin historia");
    expect(screen.getAllByText("Anexo sin historia")).toHaveLength(1);
  });
});

describe("TablaDeDocumentos: el PDF de cada fila terminada (Fase 5.3)", () => {
  const nombre = "Consentimiento informado: Tratamiento de conducto";

  it("una fila para imprimir y una sellada llevan Imprimir y Descargar PDF; un borrador y uno a firmar, no", () => {
    render(
      <TablaDeDocumentos
        documentos={[
          paraImprimir({ id: "doc-papel" }),
          resumen({ id: "doc-sellado" }),
          { ...borrador(), id: "doc-borrador" },
          aFirmar([], { id: "doc-a-firmar" }),
        ]}
        conPaciente
        vacio="nada"
      />,
    );
    const filas = screen.getAllByRole("row").slice(1);
    expect(filas).toHaveLength(4);
    const [papel, sellada, enBorrador, porFirmar] = filas;

    for (const [fila, id] of [
      [papel, "doc-papel"],
      [sellada, "doc-sellado"],
    ] as const) {
      const imprimir = within(fila).getByRole("link", { name: `Imprimir ${nombre} (se abre en una pestaña nueva)` });
      expect(imprimir).toHaveAttribute("href", `/panel/documentos/${id}/pdf?para=imprimir`);
      expect(imprimir).toHaveAttribute("target", "_blank");
      expect(within(fila).getByRole("link", { name: `Descargar PDF de ${nombre}` })).toHaveAttribute("href", `/panel/documentos/${id}/pdf`);
    }
    for (const fila of [enBorrador, porFirmar]) {
      expect(within(fila).queryByRole("link", { name: /^Imprimir/ })).not.toBeInTheDocument();
      expect(within(fila).queryByRole("link", { name: /^Descargar PDF/ })).not.toBeInTheDocument();
      // Solo el link al documento.
      expect(within(fila).getAllByRole("link").every((l) => !(l.getAttribute("href") ?? "").includes("/pdf"))).toBe(true);
    }
  });

  it("los links del PDF no navegan la fila; el resto de la fila sí", () => {
    render(<TablaDeDocumentos documentos={[paraImprimir({ id: "doc-papel" })]} vacio="nada" />);
    const fila = screen.getAllByRole("row")[1];
    fireEvent.click(within(fila).getByRole("link", { name: `Descargar PDF de ${nombre}` }));
    fireEvent.click(within(fila).getByRole("link", { name: /^Imprimir/ }));
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.click(within(fila).getAllByRole("cell")[0]);
    expect(pushMock).toHaveBeenCalledWith("/panel/documentos/doc-papel");
  });
});

describe("DocumentosDeLaFicha", () => {
  it("un profesional ve solo el botón para entrar a los documentos del paciente, sin lista", () => {
    render(<DocumentosDeLaFicha pacienteId="pac-1" esProfesional cantidad={3} />);
    expect(screen.getByRole("link", { name: "Ver documentos clínicos" })).toHaveAttribute("href", "/panel/pacientes/pac-1/documentos");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("recepción sabe cuántos hay, no qué dicen", () => {
    const { rerender } = render(<DocumentosDeLaFicha pacienteId="pac-1" esProfesional={false} cantidad={2} />);
    expect(screen.getByText("2 documentos terminados. Solo los profesionales pueden abrirlos.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<DocumentosDeLaFicha pacienteId="pac-1" esProfesional={false} cantidad={1} />);
    expect(screen.getByText(/^1 documento terminado\./)).toBeInTheDocument();
    rerender(<DocumentosDeLaFicha pacienteId="pac-1" esProfesional={false} cantidad={0} />);
    expect(screen.getByText("Todavía no tiene documentos terminados.")).toBeInTheDocument();
  });
});
