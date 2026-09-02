import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { crearPacienteActionMock } = vi.hoisted(() => ({ crearPacienteActionMock: vi.fn() }));
vi.mock("@/app/actions/pacientes", () => ({ crearPacienteAction: crearPacienteActionMock }));

const { AgregarPacienteModal } = await import("./agregar-paciente-modal");

const nuevoPaciente = {
  id: "pac-1",
  nombre: "Bruno",
  apellido: "Iglesias",
  dni: "30111222",
  telefono: "+5493511234567",
  email: "bruno@example.com",
  createdAt: new Date().toISOString(),
};

async function completarCampos(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre"), "Bruno");
  await user.type(screen.getByLabelText("Apellido"), "Iglesias");
  await user.type(screen.getByLabelText("DNI"), "30111222");
  await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
}

describe("AgregarPacienteModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nombre y apellido son obligatorios", async () => {
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nombre y apellido son obligatorios/);
    expect(crearPacienteActionMock).not.toHaveBeenCalled();
  });

  it("valida el formato del DNI antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "123");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/DNI debe tener 7 u 8 dígitos/);
    expect(crearPacienteActionMock).not.toHaveBeenCalled();
  });

  it("valida el formato del teléfono antes de llamar a la acción", async () => {
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "30111222");
    await user.type(screen.getByLabelText("Teléfono"), "123");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/teléfono no tiene un formato válido/);
    expect(crearPacienteActionMock).not.toHaveBeenCalled();
  });

  it("crea el paciente y llama a onSuccess", async () => {
    crearPacienteActionMock.mockResolvedValue({ paciente: nuevoPaciente });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={onSuccess} />);

    await completarCampos(user);
    await user.type(screen.getByLabelText("Email (opcional)"), "bruno@example.com");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(crearPacienteActionMock).toHaveBeenCalledWith({
      nombre: "Bruno",
      apellido: "Iglesias",
      dni: "30111222",
      telefono: "+5493511234567",
      email: "bruno@example.com",
    });
    expect(onSuccess).toHaveBeenCalledWith(nuevoPaciente);
  });

  it("muestra el error que devuelve la acción (p. ej. DNI ya existe)", async () => {
    crearPacienteActionMock.mockResolvedValue({ error: "ya existe un paciente con ese DNI" });
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    await completarCampos(user);
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ya existe un paciente con ese DNI");
  });

  it("se cierra con Cancelar y con la X", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AgregarPacienteModal onClose={onClose} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
