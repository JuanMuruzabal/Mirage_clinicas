import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { aFirmar, borrador, sellado } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
    expect(screen.getByText(/Todavía no hay documentos firmados/)).toBeInTheDocument();
  });
});

describe("TablaDeDocumentos", () => {
  it("el registro: folio, documento, autor (con la marca de colega) y estado", () => {
    render(<TablaDeDocumentos documentos={[resumen(), resumen({ id: "doc-2", esMio: false, autorNombre: "Pedro Díaz", folio: 2 })]} vacio="nada" />);
    expect(screen.getAllByRole("link", { name: "Tratamiento de conducto" })[0]).toHaveAttribute("href", "/panel/documentos/doc-1");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("(colega)")).toBeInTheDocument();
    expect(screen.getAllByText("Firmado y sellado")).toHaveLength(2);
  });

  it("en curso: con el paciente, sin folio", () => {
    render(<TablaDeDocumentos documentos={[borrador()]} conPaciente vacio="nada" />);
    expect(screen.getByText("Ana Paz")).toBeInTheDocument();
    expect(screen.queryByText("Folio")).not.toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
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
  });
});

describe("DocumentosDeLaFicha", () => {
  it("un profesional ve los últimos tres y llega al registro", () => {
    const docs = [resumen(), resumen({ id: "d2" }), aFirmar(), resumen({ id: "d4" })];
    render(<DocumentosDeLaFicha pacienteId="pac-1" documentos={docs} cantidadSellados={3} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Ver todos (4) →" })).toHaveAttribute("href", "/panel/pacientes/pac-1/documentos");
    expect(screen.getByRole("link", { name: "+ Nuevo" })).toHaveAttribute("href", "/panel/documentos?paciente=pac-1");
  });

  it("un profesional sin documentos del paciente: la invitación a empezar", () => {
    render(<DocumentosDeLaFicha pacienteId="pac-1" documentos={[]} cantidadSellados={0} />);
    expect(screen.getByText(/Todavía no tiene documentos/)).toBeInTheDocument();
  });

  it("recepción sabe cuántos hay, no qué dicen", () => {
    const { rerender } = render(<DocumentosDeLaFicha pacienteId="pac-1" documentos={null} cantidadSellados={2} />);
    expect(screen.getByText("2 documentos firmados. Solo los profesionales pueden abrirlos.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    rerender(<DocumentosDeLaFicha pacienteId="pac-1" documentos={null} cantidadSellados={1} />);
    expect(screen.getByText(/^1 documento firmado\./)).toBeInTheDocument();
    rerender(<DocumentosDeLaFicha pacienteId="pac-1" documentos={null} cantidadSellados={0} />);
    expect(screen.getByText("Todavía no tiene documentos firmados.")).toBeInTheDocument();
  });
});
