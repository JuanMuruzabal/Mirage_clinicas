import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { editarPacienteActionMock } = vi.hoisted(() => ({ editarPacienteActionMock: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => ({ editarPacienteAction: editarPacienteActionMock }));

const { PacienteDatos } = await import("./paciente-datos");

const paciente = {
  id: "pac-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "+5493511234567",
  email: "bruno@example.com",
  createdAt: new Date().toISOString(),
};

describe("PacienteDatos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra DNI, teléfono y email", () => {
    render(<PacienteDatos pacienteInicial={paciente} />);
    expect(screen.getByText("30111222")).toBeInTheDocument();
    expect(screen.getByText("+5493511234567")).toBeInTheDocument();
    expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
  });

  it("muestra — cuando no hay email", () => {
    render(<PacienteDatos pacienteInicial={{ ...paciente, email: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("'Editar datos' abre el modal, y al guardar actualiza los datos mostrados", async () => {
    editarPacienteActionMock.mockResolvedValue({ paciente: { ...paciente, dni: "30222333" } });
    const user = userEvent.setup();
    render(<PacienteDatos pacienteInicial={paciente} />);

    await user.click(screen.getByRole("button", { name: "Editar datos" }));
    expect(await screen.findByRole("dialog", { name: "Editar datos del paciente" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("DNI"));
    await user.type(screen.getByLabelText("DNI"), "30222333");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.queryByRole("dialog", { name: "Editar datos del paciente" })).not.toBeInTheDocument();
    expect(screen.getByText("30222333")).toBeInTheDocument();
  });
});
