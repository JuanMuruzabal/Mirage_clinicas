import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { editarPacienteActionMock } = vi.hoisted(() => ({ editarPacienteActionMock: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => ({ editarPacienteAction: editarPacienteActionMock }));

const { EditarPacienteModal } = await import("./editar-paciente-modal");

const paciente = {
  id: "pac-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "+5493511234567",
  email: "bruno@example.com",
  createdAt: new Date().toISOString(),
};

describe("EditarPacienteModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("precarga DNI/teléfono/email actuales", () => {
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByLabelText("DNI")).toHaveValue("30111222");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("+5493511234567");
    expect(screen.getByLabelText("Email (opcional)")).toHaveValue("bruno@example.com");
  });

  it("valida el formato del DNI antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.clear(screen.getByLabelText("DNI"));
    await user.type(screen.getByLabelText("DNI"), "123");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/DNI debe tener 7 u 8 dígitos/);
    expect(editarPacienteActionMock).not.toHaveBeenCalled();
  });

  it("valida el formato del teléfono antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.clear(screen.getByLabelText("Teléfono"));
    await user.type(screen.getByLabelText("Teléfono"), "123");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/teléfono no tiene un formato válido/);
    expect(editarPacienteActionMock).not.toHaveBeenCalled();
  });

  it("guarda cambios y llama a onSuccess con el paciente actualizado", async () => {
    editarPacienteActionMock.mockResolvedValue({ paciente: { ...paciente, dni: "30222333" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={onSuccess} />);

    await user.clear(screen.getByLabelText("DNI"));
    await user.type(screen.getByLabelText("DNI"), "30222333");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(editarPacienteActionMock).toHaveBeenCalledWith("pac-1", {
      dni: "30222333",
      telefono: "+5493511234567",
      email: "bruno@example.com",
    });
    expect(onSuccess).toHaveBeenCalledWith({ ...paciente, dni: "30222333" });
  });

  it("muestra el error que devuelve la acción", async () => {
    editarPacienteActionMock.mockResolvedValue({ error: "paciente no encontrado" });
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("paciente no encontrado");
  });

  it("se cierra con Cancelar y con la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditarPacienteModal paciente={paciente} onClose={onClose} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
