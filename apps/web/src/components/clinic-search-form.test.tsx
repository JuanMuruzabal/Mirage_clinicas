import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClinicSearchForm } from "./clinic-search-form";

const especialidades = [
  { id: "esp-1", nombre: "Odontología general" },
  { id: "esp-2", nombre: "Ortodoncia" },
];

describe("ClinicSearchForm", () => {
  it("es un formulario GET a /buscar (sin JS, URL compartible)", () => {
    const { container } = render(<ClinicSearchForm especialidades={especialidades} />);
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", "/buscar");
    expect(form).toHaveAttribute("method", "get");
  });

  it("lista las especialidades del catálogo en el select", () => {
    render(<ClinicSearchForm especialidades={especialidades} />);
    expect(screen.getByRole("option", { name: "Odontología general" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ortodoncia" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Todas" })).toBeInTheDocument();
  });

  it("precarga los valores actuales de búsqueda", () => {
    render(<ClinicSearchForm especialidades={especialidades} defaultQ="Sonrisas" defaultEspecialidad="Ortodoncia" />);
    expect(screen.getByLabelText("Clínica o profesional")).toHaveValue("Sonrisas");
    expect(screen.getByLabelText("Especialidad")).toHaveValue("Ortodoncia");
  });

  it("tiene un botón Buscar", () => {
    render(<ClinicSearchForm especialidades={especialidades} />);
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
  });
});
