import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClinicaPublicaTemplate } from "./clinica-publica-template";

const props = {
  slug: "clinica-sonrisas",
  nombreClinica: "Clínica Sonrisas",
  profesionalNombre: "María Games",
  telefono: "+5493511234567",
  especialidades: ["Odontología general", "Ortodoncia"],
};

describe("ClinicaPublicaTemplate", () => {
  it("muestra las 3 secciones fijas de la plantilla (spec §5.3): turno, sobre nosotros y especialidades", () => {
    render(<ClinicaPublicaTemplate {...props} />);
    expect(screen.getByText("Clínica Sonrisas")).toBeInTheDocument();
    expect(screen.getByText("María Games")).toBeInTheDocument();
    // "Pedí tu turno" y "Sobre nosotros" aparecen dos veces cada uno (el
    // ancla del header básico + el título de la sección) — se usa
    // getByRole("heading") para apuntar al título, no al ancla.
    expect(screen.getByRole("heading", { name: "Pedí tu turno" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sobre nosotros" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Especialidades" })).toBeInTheDocument();
    expect(screen.getByText("Odontología general")).toBeInTheDocument();
    expect(screen.getByText("Ortodoncia")).toBeInTheDocument();
  });

  it("el header básico de la plantilla enlaza a cada sección por ancla", () => {
    render(<ClinicaPublicaTemplate {...props} />);
    expect(screen.getByRole("link", { name: "Pedí tu turno" })).toHaveAttribute("href", "#turno");
    expect(screen.getByRole("link", { name: "Sobre nosotros" })).toHaveAttribute("href", "#sobre-nosotros");
    expect(screen.getByRole("link", { name: "Especialidades" })).toHaveAttribute("href", "#especialidades");
  });

  it("sin especialidades, el header básico tampoco muestra el ancla a esa sección", () => {
    render(<ClinicaPublicaTemplate {...props} especialidades={[]} />);
    expect(screen.queryByRole("link", { name: "Especialidades" })).not.toBeInTheDocument();
  });

  it("sin especialidades, no muestra la sección (nada que listar)", () => {
    render(<ClinicaPublicaTemplate {...props} especialidades={[]} />);
    expect(screen.queryByText("Especialidades")).not.toBeInTheDocument();
  });

  it("el placeholder de 'Sobre nosotros' es honesto, no contenido inventado", () => {
    render(<ClinicaPublicaTemplate {...props} />);
    expect(screen.getByText(/todavía no tiene contenido propio/)).toBeInTheDocument();
  });
});
