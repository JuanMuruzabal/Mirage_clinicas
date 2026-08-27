import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataField } from "./data-field";

// TR-064 en docs/tradeoffs.md (pedido explícito del cliente, 2026-08-26):
// "motivo y fecha y hora como pares label/valor ocultando la fila si el
// valor está vacío".
describe("DataField", () => {
  it("muestra el label y el valor cuando hay valor", () => {
    render(<DataField label="Motivo" value="Dolor de muela" />);
    expect(screen.getByText("Motivo")).toBeInTheDocument();
    expect(screen.getByText("Dolor de muela")).toBeInTheDocument();
  });

  it("no renderiza nada con value=''", () => {
    const { container } = render(<DataField label="Motivo" value="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada con value=null", () => {
    const { container } = render(<DataField label="Motivo" value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada con value=undefined (prop ausente)", () => {
    const { container } = render(<DataField label="Motivo" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("acepta un valor numérico (0 se muestra, no se trata como vacío)", () => {
    render(<DataField label="Cantidad" value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
