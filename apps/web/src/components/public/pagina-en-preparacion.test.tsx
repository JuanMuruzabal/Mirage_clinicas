import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaginaEnPreparacion } from "./pagina-en-preparacion";

describe("PaginaEnPreparacion", () => {
  it("muestra el nombre de la clínica y el aviso de preparación", () => {
    render(<PaginaEnPreparacion nombreClinica="Clínica Sonrisas" />);
    expect(screen.getByText("Clínica Sonrisas")).toBeInTheDocument();
    expect(screen.getByText(/en preparación/)).toBeInTheDocument();
  });
});
