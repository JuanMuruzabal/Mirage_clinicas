import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { paraImprimir, sellado } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { RegistroDeDocumentos } = await import("./registro-de-documentos");

const documentos: DocumentoResumen[] = [
  { ...paraImprimir(), id: "c1", folio: 3, plantillaNombre: "Tratamiento de conducto", tipo: "consentimiento", terminadoEn: "2026-09-28T10:00:00-03:00" },
  { ...sellado(), id: "h1", folio: 2, plantillaNombre: "Historia clínica general", tipo: "historia_clinica", autorNombre: "Pedro Díaz", selladoEn: "2026-09-10T10:00:00-03:00" },
  { ...sellado(), id: "a1", folio: 1, plantillaNombre: "Anexo de odontopediatría", tipo: "anexo", selladoEn: "2026-08-01T10:00:00-03:00" },
];

function filas(): string[] {
  const tabla = screen.getByRole("table");
  return within(tabla)
    .getAllByRole("link")
    .map((l) => l.textContent ?? "");
}

describe("RegistroDeDocumentos", () => {
  it("sin filtros, todos; buscar por documento, profesional o folio", () => {
    render(<RegistroDeDocumentos documentos={documentos} />);
    expect(filas()).toHaveLength(3);
    const buscar = screen.getByRole("searchbox", { name: "Buscar" });
    fireEvent.change(buscar, { target: { value: "conducto" } });
    expect(filas()).toEqual(["Tratamiento de conducto"]);
    fireEvent.change(buscar, { target: { value: "pedro diaz" } });
    expect(filas()).toEqual(["Historia clínica general"]);
    fireEvent.change(buscar, { target: { value: "1" } });
    expect(filas()).toEqual(["Anexo de odontopediatría"]);
  });

  it("por tipo, y lo que no es consentimiento ni historia va en «Otros»", () => {
    render(<RegistroDeDocumentos documentos={documentos} />);
    const tipo = screen.getByRole("combobox", { name: "Tipo" });
    fireEvent.change(tipo, { target: { value: "consentimiento" } });
    expect(filas()).toEqual(["Tratamiento de conducto"]);
    fireEvent.change(tipo, { target: { value: "historia_clinica" } });
    expect(filas()).toEqual(["Historia clínica general"]);
    fireEvent.change(tipo, { target: { value: "otros" } });
    expect(filas()).toEqual(["Anexo de odontopediatría"]);
  });

  it("por fecha, y «Limpiar» vuelve a mostrar todos", () => {
    render(<RegistroDeDocumentos documentos={documentos} />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-01" } });
    expect(filas()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-09-15" } });
    expect(filas()).toEqual(["Historia clínica general"]);
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-08-15" } });
    expect(screen.getByText("Ningún documento coincide con los filtros.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(filas()).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Limpiar" })).not.toBeInTheDocument();
  });

  it("sin documentos, no hay filtros: lo dice y listo", () => {
    render(<RegistroDeDocumentos documentos={[]} />);
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getByText("Todavía no hay documentos para este paciente.")).toBeInTheDocument();
  });
});
