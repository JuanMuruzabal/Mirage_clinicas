import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MigaDelDocumento, VinculosDelDocumento } from "./vinculos-del-documento";

// El vínculo anexo ↔ historia en el encabezado del documento (5.6b).

const historia = { id: "h1", nombre: "Historia clínica general", estado: "sellado" as const, folio: 3, folioMostrado: "3", fecha: "2026-09-27T14:05:00-03:00" };

describe("VinculosDelDocumento", () => {
  it("sin vínculos, nada", () => {
    const { container } = render(<VinculosDelDocumento documento={{ anexoDe: null }} />);
    expect(container).toBeEmptyDOMElement();
    const { container: otro } = render(<VinculosDelDocumento documento={{ anexoDe: null, anexos: [], historiaNoVisible: false }} />);
    expect(otro).toBeEmptyDOMElement();
  });

  it("un anexo dice de qué historia es, con link, folio y fecha", () => {
    render(<VinculosDelDocumento documento={{ anexoDe: historia }} />);
    expect(screen.getByRole("link", { name: "Historia clínica general" })).toHaveAttribute("href", "/panel/documentos/h1");
    expect(screen.getByText("Anexo de")).toBeInTheDocument();
    expect(screen.getByText("Folio 3 · 27/09/2026 · 14:05")).toBeInTheDocument();
  });

  it("una historia sin folio se señala por su estado", () => {
    render(<VinculosDelDocumento documento={{ anexoDe: { ...historia, folio: undefined, folioMostrado: undefined, estado: "borrador" } }} />);
    // El estado va en su pastilla, y el detalle queda en la fecha.
    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("27/09/2026 · 14:05")).toBeInTheDocument();
  });

  it("una historia lista sus anexos, uno por renglón, cada uno con su link y su fecha", () => {
    render(
      <VinculosDelDocumento
        documento={{
          anexoDe: null,
          anexos: [
            { id: "a1", nombre: "Anexo de prueba", estado: "borrador", fecha: "2026-09-28T09:00:00-03:00" },
            { id: "a2", nombre: "Anexo de prueba", estado: "a_firmar", fecha: "2026-09-29T11:30:00-03:00" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Anexos")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Anexo de prueba" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/panel/documentos/a1", "/panel/documentos/a2"]);
    const renglones = screen.getAllByRole("listitem");
    expect(renglones).toHaveLength(2);
    // Dos anexos iguales sin folio se distinguen por la fecha.
    expect(renglones[0]).toHaveTextContent("Borrador");
    expect(renglones[0]).toHaveTextContent("28/09/2026 · 09:00");
    expect(renglones[1]).toHaveTextContent("Completado");
    expect(renglones[1]).toHaveTextContent("Falta firmar");
    expect(renglones[1]).toHaveTextContent("29/09/2026 · 11:30");
    expect(screen.queryByText("Anexo de")).not.toBeInTheDocument();
  });

  it("en el editor, el anexo de continuación no se repite en la lista: va junto a su campo", () => {
    render(
      <VinculosDelDocumento
        documento={{
          anexoDe: null,
          anexos: [
            { id: "a1", nombre: "Anexo de prueba", estado: "borrador", fecha: "2026-09-28T09:00:00-03:00" },
            {
              id: "c1",
              nombre: "Anexo de continuación",
              estado: "abierto",
              fecha: "2026-09-29T11:30:00-03:00",
              continuacion: { seccion: "plan", numero: 1 },
            },
          ],
        }}
        continuacionesEnElEditor
      />,
    );
    expect(screen.getByRole("link", { name: "Anexo de prueba" })).toBeInTheDocument();
    expect(screen.queryByText(/Anexo Nº 1/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("en el editor, una historia con solo anexos de continuación no muestra la lista", () => {
    const { container } = render(
      <VinculosDelDocumento
        documento={{
          anexoDe: null,
          anexos: [
            { id: "c1", nombre: "Anexo de continuación", estado: "abierto", fecha: "2026-09-29T11:30:00-03:00", continuacion: { seccion: "plan", numero: 1 } },
          ],
        }}
        continuacionesEnElEditor
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("una historia que no se ve se menciona sin link ni ningún dato de ella", () => {
    render(<VinculosDelDocumento documento={{ anexoDe: null, historiaNoVisible: true }} />);
    expect(screen.getByText("Anexo de una historia clínica que todavía no terminaron")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("la miga lleva al módulo, a los documentos del paciente y, en un anexo, a su historia", () => {
    render(
      <MigaDelDocumento
        documento={{ paciente: { id: "p1", nombre: "Juan", apellido: "Pérez", dni: "1" } as never, anexoDe: { ...historia, nombre: "anexo-viejo" } }}
        titulo="Anexo Nº 1 · Diagnóstico"
      />,
    );
    const hrefs = screen.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")]);
    expect(hrefs).toEqual([
      ["Documentos", "/panel/documentos"],
      ["Juan Pérez", "/panel/pacientes/p1/documentos"],
      // Un modelo que ya no existe nunca muestra su id interno.
      ["Modelo retirado", "/panel/documentos/h1"],
    ]);
    expect(screen.getByText("Anexo Nº 1 · Diagnóstico")).toHaveAttribute("aria-current", "page");
  });
});
