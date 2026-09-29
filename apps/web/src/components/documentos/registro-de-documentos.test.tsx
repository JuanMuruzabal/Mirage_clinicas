import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { paraImprimir, sellado } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { RegistroDeDocumentos } = await import("./registro-de-documentos");

const documentos: DocumentoResumen[] = [
  {
    ...paraImprimir(),
    id: "c1",
    folio: 4,
    plantillaId: "consentimiento-tratamiento-conducto",
    plantillaNombre: "Tratamiento de conducto",
    tipo: "consentimiento",
    terminadoEn: "2026-09-28T10:00:00-03:00",
    hashContenido: "c0ffee00111122223333444455556666777788889999aaaabbbbccccddddeeee",
  },
  {
    ...sellado(),
    id: "h1",
    folio: 3,
    plantillaId: "historia-adultos",
    plantillaNombre: "Adultos",
    tipo: "historia_clinica",
    autorNombre: "Pedro Díaz",
    selladoEn: "2026-09-10T10:00:00-03:00",
    hashContenido: "beef0000111122223333444455556666777788889999aaaabbbbccccddddeeee",
  },
  {
    ...paraImprimir(),
    id: "c2",
    folio: 2,
    plantillaId: "consentimiento-tratamiento-conducto",
    plantillaNombre: "Tratamiento de conducto",
    tipo: "consentimiento",
    terminadoEn: "2026-08-20T10:00:00-03:00",
    hashContenido: "dead0000111122223333444455556666777788889999aaaabbbbccccddddeeee",
  },
  {
    ...sellado(),
    id: "a1",
    folio: 1,
    plantillaId: "anexo-odontopediatria",
    plantillaNombre: "Odontopediatría",
    tipo: "anexo",
    selladoEn: "2026-08-01T10:00:00-03:00",
    hashContenido: "abad0000111122223333444455556666777788889999aaaabbbbccccddddeeee",
  },
];

const CONDUCTO = "Consentimiento informado: Tratamiento de conducto";

function filas(): string[] {
  return within(screen.getByRole("table"))
    .getAllByRole("link")
    .map((l) => l.textContent ?? "");
}

function abrirFiltros() {
  fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
  return screen.getByRole("dialog", { name: "Filtros" });
}

describe("RegistroDeDocumentos", () => {
  it("el buscador a la vista: por documento y su tipo, profesional, folio o huella", () => {
    render(<RegistroDeDocumentos documentos={documentos} />);
    expect(filas()).toHaveLength(4);
    const buscar = screen.getByRole("searchbox", { name: "Buscar por documento, profesional, folio o huella" });
    fireEvent.change(buscar, { target: { value: "consentimiento" } });
    expect(filas()).toEqual([CONDUCTO, CONDUCTO]);
    fireEvent.change(buscar, { target: { value: "pedro diaz" } });
    expect(filas()).toEqual(["Historia clínica: Adultos"]);
    fireEvent.change(buscar, { target: { value: "1" } });
    expect(filas()).toContain("Anexo: Odontopediatría");
    fireEvent.change(buscar, { target: { value: "beef" } });
    expect(filas()).toEqual(["Historia clínica: Adultos"]);
    fireEvent.change(buscar, { target: { value: "ninguno" } });
    expect(screen.getByText("Ningún documento coincide con la búsqueda o los filtros.")).toBeInTheDocument();
  });

  it("los filtros van en la hoja de «Filtros», como en Turnos: el documento es un modelo puntual", () => {
    render(<RegistroDeDocumentos documentos={documentos} />);
    const hoja = abrirFiltros();
    const documento = within(hoja).getByRole("combobox", { name: "Documento" });
    // Un modelo por opción, con su tipo adelante, aunque haya dos documentos de él.
    expect(within(documento).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Todos los documentos",
      "Anexo: Odontopediatría",
      CONDUCTO,
      "Historia clínica: Adultos",
    ]);
    fireEvent.change(documento, { target: { value: "consentimiento-tratamiento-conducto" } });
    // La tabla no cambia hasta confirmar; el botón cuenta en vivo.
    expect(filas()).toHaveLength(4);
    fireEvent.click(within(hoja).getByRole("button", { name: "Ver 2 documentos" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(filas()).toEqual([CONDUCTO, CONDUCTO]);
    expect(screen.getByRole("button", { name: /^Filtros/ })).toHaveTextContent("1");
  });

  it("por fecha, con los atajos y Desde/Hasta; un rango cuenta como un filtro, y se limpia", () => {
    render(<RegistroDeDocumentos documentos={documentos} />);
    let hoja = abrirFiltros();
    expect(within(hoja).getByRole("button", { name: "Hoy" })).toBeInTheDocument();
    expect(within(hoja).getByRole("button", { name: "Semana" })).toBeInTheDocument();
    expect(within(hoja).getByRole("button", { name: "Mes" })).toBeInTheDocument();
    fireEvent.change(within(hoja).getByLabelText("Desde"), { target: { value: "2026-09-01" } });
    fireEvent.change(within(hoja).getByLabelText("Hasta"), { target: { value: "2026-09-15" } });
    fireEvent.click(within(hoja).getByRole("button", { name: "Ver 1 documento" }));
    expect(filas()).toEqual(["Historia clínica: Adultos"]);
    expect(screen.getByRole("button", { name: /^Filtros/ })).toHaveTextContent("1");

    // Al volver a abrir, la hoja arranca con lo aplicado; «Limpiar filtros» vacía el borrador.
    hoja = abrirFiltros();
    expect(within(hoja).getByLabelText("Desde")).toHaveValue("2026-09-01");
    fireEvent.click(within(hoja).getByRole("button", { name: "Limpiar filtros" }));
    expect(within(hoja).queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
    fireEvent.click(within(hoja).getByRole("button", { name: "Ver 4 documentos" }));
    expect(filas()).toHaveLength(4);
  });

  it("un atajo precarga las dos fechas", () => {
    render(<RegistroDeDocumentos documentos={documentos} />);
    const hoja = abrirFiltros();
    fireEvent.click(within(hoja).getByRole("button", { name: "Hoy" }));
    expect((within(hoja).getByLabelText("Desde") as HTMLInputElement).value).not.toBe("");
    expect((within(hoja).getByLabelText("Hasta") as HTMLInputElement).value).not.toBe("");
  });

  it("sin documentos, ni buscador ni filtros: lo dice y listo", () => {
    render(<RegistroDeDocumentos documentos={[]} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Filtros/ })).not.toBeInTheDocument();
    expect(screen.getByText("Todavía no hay documentos para este paciente.")).toBeInTheDocument();
  });
});
