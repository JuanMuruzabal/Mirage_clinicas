import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { conducto, todoTipo } from "./fixtures";

const acciones = vi.hoisted(() => ({ crearDocumentoAction: vi.fn() }));
vi.mock("@/app/actions/documentos", () => acciones);
const pacientes = vi.hoisted(() => ({ listPacientesAction: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => pacientes);

const { ModuloDocumentos } = await import("./modulo-documentos");

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

const plantillas = [conducto, todoTipo];

describe("ModuloDocumentos", () => {
  it("las flechas recorren los documentos como una rueda, y la vista acompaña", () => {
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vista de Tratamiento de conducto" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Vista de Prueba de campos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documento siguiente" }));
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documento anterior" }));
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
  });

  it("el buscador encuentra por nombre, sin tildes, y Enter elige", () => {
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    const buscar = screen.getByRole("combobox", { name: "Buscar un documento" });
    fireEvent.change(buscar, { target: { value: "campos" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(buscar, { key: "Enter" });
    expect(screen.getByText("2 de 2")).toBeInTheDocument();

    fireEvent.change(buscar, { target: { value: "ortodoncia" } });
    expect(screen.getByText("No hay ningún documento con ese nombre.")).toBeInTheDocument();
    fireEvent.keyDown(buscar, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.focus(buscar);
    fireEvent.change(buscar, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Tratamiento de conducto/ }));
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
  });

  it("la plantilla de entrada se puede elegir, y el modelo del Colegio se abre aparte", () => {
    render(<ModuloDocumentos plantillas={plantillas} plantillaInicial="prueba-todo-tipo" hoy="2026-09-27" />);
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver el modelo del Colegio ↗" })).toHaveAttribute("href", "https://example.com/modelo");
  });

  it("completar pide el paciente, y elegirlo crea el documento", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pacientes.listPacientesAction.mockResolvedValue([
      { id: "pac-1", nombre: "Ana", apellido: "Paz", dni: "30111222", telefono: "", email: "", esMio: true },
      { id: "pac-2", nombre: "Juan", apellido: "Paz", dni: "35111222", telefono: "", email: "", esMio: false },
    ]);
    acciones.crearDocumentoAction.mockResolvedValue({ error: "completá tu perfil profesional antes de hacer un documento" });
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Completar este documento" }));
    expect(await screen.findByRole("dialog", { name: "¿Para qué paciente?" })).toBeInTheDocument();
    expect(screen.getByText("Escribí al menos dos letras o números.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Buscá por nombre, apellido o DNI"), { target: { value: "Paz" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(pacientes.listPacientesAction).toHaveBeenCalledWith("Paz");
    expect(screen.getByText("Tu paciente")).toBeInTheDocument();
    expect(screen.getByText("De la clínica")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Juan Paz/ }));
    });
    expect(acciones.crearDocumentoAction).toHaveBeenCalledWith("consentimiento-tratamiento-conducto", "pac-2");
    expect(screen.getByRole("alert")).toHaveTextContent("completá tu perfil profesional");
  });

  it("una búsqueda sin resultados lo dice", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pacientes.listPacientesAction.mockResolvedValue([]);
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Completar este documento" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Buscá por nombre, apellido o DNI"), { target: { value: "Zz" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.getByText("No hay ningún paciente con esos datos en la clínica.")).toBeInTheDocument();
  });

  it("desde la ficha, el documento ya es para ese paciente", async () => {
    acciones.crearDocumentoAction.mockResolvedValue({ error: "este paciente tiene un conflicto de identidad sin resolver" });
    render(<ModuloDocumentos plantillas={plantillas} hoy="2026-09-27" paciente={{ id: "pac-1", nombre: "Ana", apellido: "Paz" }} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completar para Ana Paz" }));
    });
    expect(acciones.crearDocumentoAction).toHaveBeenCalledWith("consentimiento-tratamiento-conducto", "pac-1");
    expect(screen.getByRole("alert")).toHaveTextContent("conflicto de identidad");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
