import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaginaEnMantenimiento } from "./pagina-en-mantenimiento";

describe("PaginaEnMantenimiento", () => {
  it("muestra el nombre de la clínica y el aviso de mantenimiento", () => {
    render(<PaginaEnMantenimiento nombreClinica="Clínica Sonrisas" />);
    expect(screen.getByText("Clínica Sonrisas")).toBeInTheDocument();
    expect(screen.getByText(/en mantenimiento/)).toBeInTheDocument();
  });
});
