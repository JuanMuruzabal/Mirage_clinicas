import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { DocumentoResumen } from "@dental-mirage/shared-types";
import { paraImprimir, sellado } from "./fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { RegistroDeDocumentos } = await import("./registro-de-documentos");

// El registro de un paciente en dos tablas (5.6b, ronda A): consentimientos,
// e historias clínicas con sus anexos debajo.

const consentimiento: DocumentoResumen = {
  ...paraImprimir(),
  id: "c1",
  folio: 5,
  folioMostrado: "5",
  plantillaId: "consentimiento-tratamiento-conducto",
  plantillaNombre: "Tratamiento de conducto",
  tipo: "consentimiento",
  terminadoEn: "2026-09-28T10:00:00-03:00",
};
const historia: DocumentoResumen = {
  ...sellado(),
  id: "h1",
  folio: 3,
  folioMostrado: "3",
  plantillaId: "historia-clinica-general",
  plantillaNombre: "Historia clínica general",
  tipo: "historia_clinica",
  selladoEn: "2026-09-10T10:00:00-03:00",
};
const anexoDeH1: DocumentoResumen = {
  ...sellado(),
  id: "a1",
  folio: 4,
  folioMostrado: "4",
  plantillaId: "anexo-de-prueba",
  plantillaNombre: "Anexo de prueba",
  tipo: "anexo",
  selladoEn: "2026-09-12T10:00:00-03:00",
  anexoDe: { id: "h1", nombre: "Historia clínica general", estado: "sellado", folio: 3, folioMostrado: "3", fecha: "2026-09-10T10:00:00-03:00" },
};
const anexoOculto: DocumentoResumen = {
  ...sellado(),
  id: "a2",
  folio: 6,
  folioMostrado: "6",
  plantillaId: "anexo-de-prueba",
  plantillaNombre: "Anexo de prueba",
  tipo: "anexo",
  selladoEn: "2026-09-29T10:00:00-03:00",
  anexoDe: null,
  historiaNoVisible: true,
};

function tabla(nombre: string) {
  return within(screen.getByRole("region", { name: nombre })).queryByRole("table");
}
function nombres(nombre: string): string[] {
  const t = tabla(nombre);
  if (!t) return [];
  return within(t)
    .getAllByRole("row")
    .slice(1)
    .map((f) => {
      const link = within(f).queryAllByRole("link").find((l) => !(l.getAttribute("href") ?? "").includes("/pdf"));
      return link?.textContent ?? f.textContent ?? "";
    });
}

describe("RegistroDeDocumentos en dos tablas (5.6b)", () => {
  it("consentimientos e historias por separado, en ese orden, y sin el tipo adelante", () => {
    render(<RegistroDeDocumentos documentos={[anexoOculto, consentimiento, anexoDeH1, historia]} />);
    const secciones = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(secciones).toEqual(["Consentimientos informados", "Historias clínicas"]);
    expect(nombres("Consentimientos informados")).toEqual(["Tratamiento de conducto"]);
    // La historia con su anexo debajo; al final, el rótulo y el anexo de la historia oculta.
    expect(nombres("Historias clínicas")).toEqual([
      "Historia clínica general",
      "Anexo de prueba",
      "Historia de otro profesional, todavía sin terminar",
      "Anexo de prueba",
    ]);
    expect(screen.queryByText(/^Consentimiento informado:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Historia clínica:/)).not.toBeInTheDocument();
  });

  it("los filtros valen para las dos tablas; la que se queda sin nada lo dice", () => {
    render(<RegistroDeDocumentos documentos={[consentimiento, historia, anexoDeH1]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "conducto" } });
    expect(nombres("Consentimientos informados")).toEqual(["Tratamiento de conducto"]);
    expect(tabla("Historias clínicas")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Historias clínicas" })).getByText("Ninguno coincide con la búsqueda o los filtros.")).toBeInTheDocument();

    // Filtrar por el anexo: queda solo, sin su historia, y dice de cuál es.
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    const hoja = screen.getByRole("dialog", { name: "Filtros" });
    fireEvent.change(within(hoja).getByRole("combobox", { name: "Documento" }), { target: { value: "anexo-de-prueba" } });
    fireEvent.click(within(hoja).getByRole("button", { name: "Ver 1 documento" }));
    expect(tabla("Consentimientos informados")).toBeNull();
    expect(nombres("Historias clínicas")).toEqual(["Anexo de prueba"]);
    expect(screen.getByText("De: Historia clínica general · folio 3")).toBeInTheDocument();
  });

  it("un paciente sin consentimientos lo dice en esa tabla, distinto de un filtro", () => {
    render(<RegistroDeDocumentos documentos={[historia]} />);
    expect(within(screen.getByRole("region", { name: "Consentimientos informados" })).getByText("Todavía no hay consentimientos informados para este paciente.")).toBeInTheDocument();
    expect(nombres("Historias clínicas")).toEqual(["Historia clínica general"]);
  });

  it("si nada coincide, un solo aviso, sin las dos tablas", () => {
    render(<RegistroDeDocumentos documentos={[consentimiento, historia, anexoDeH1]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-existe" } });
    expect(screen.getAllByText(/coincide/)).toHaveLength(1);
    expect(screen.getByText("Ningún documento coincide con la búsqueda o los filtros.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });
});
