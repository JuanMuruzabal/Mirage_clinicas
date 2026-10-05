import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VinculosDelDocumento } from "./vinculos-del-documento";

// El vínculo anexo ↔ historia en el encabezado del documento (5.6b).

const historia = { id: "h1", nombre: "Historia clínica general", estado: "sellado" as const, folio: 3, fecha: "2026-09-27T14:05:00-03:00" };

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
    const renglon = screen.getByText(/Anexo de:/);
    expect(renglon).toHaveTextContent("Anexo de: Historia clínica general · folio 3 · 27/09/2026 · 14:05");
  });

  it("una historia sin folio se señala por su estado", () => {
    render(<VinculosDelDocumento documento={{ anexoDe: { ...historia, folio: undefined, estado: "borrador" } }} />);
    expect(screen.getByText(/Anexo de:/)).toHaveTextContent("· Borrador ·");
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
    expect(screen.getByText("Anexos:")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Anexo de prueba" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/panel/documentos/a1", "/panel/documentos/a2"]);
    const renglones = screen.getAllByRole("listitem");
    expect(renglones).toHaveLength(2);
    // Dos anexos iguales sin folio se distinguen por la fecha.
    expect(renglones[0]).toHaveTextContent("Borrador · 28/09/2026 · 09:00");
    expect(renglones[1]).toHaveTextContent("Completado, falta firmar · 29/09/2026 · 11:30");
    expect(screen.queryByText(/Anexo de:/)).not.toBeInTheDocument();
  });

  it("una historia que no se ve se menciona sin link ni ningún dato de ella", () => {
    render(<VinculosDelDocumento documento={{ anexoDe: null, historiaNoVisible: true }} />);
    expect(screen.getByText("Anexo de una historia clínica que todavía no terminaron")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
