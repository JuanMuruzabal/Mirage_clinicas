import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EstadoVerificadoBadge } from "./estado-verificado-badge";

describe("EstadoVerificadoBadge", () => {
  it("con verificado=true, muestra VERIFICADO", () => {
    render(<EstadoVerificadoBadge verificado={true} />);
    expect(screen.getByText("VERIFICADO")).toBeInTheDocument();
  });

  it("con verificado=false, muestra NO VERIFICADO", () => {
    render(<EstadoVerificadoBadge verificado={false} />);
    expect(screen.getByText("NO VERIFICADO")).toBeInTheDocument();
  });

  it("sin la prop (undefined), trata como no verificado", () => {
    render(<EstadoVerificadoBadge />);
    expect(screen.getByText("NO VERIFICADO")).toBeInTheDocument();
  });
});
