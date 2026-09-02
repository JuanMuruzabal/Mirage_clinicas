import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock, crearPacienteActionMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  crearPacienteActionMock: vi.fn(),
}));
// mismo mock que pacientes-table.test.tsx/clickable-table-row.test.tsx.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/app/actions/pacientes", () => ({ crearPacienteAction: crearPacienteActionMock }));

const { AgregarPacienteButton } = await import("./agregar-paciente-button");

describe("AgregarPacienteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("abre y cierra el modal", async () => {
    const user = userEvent.setup();
    render(<AgregarPacienteButton />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+ Agregar paciente" }));
    expect(screen.getByRole("dialog", { name: "Agregar paciente" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al crear un paciente, cierra el modal y refresca la página", async () => {
    crearPacienteActionMock.mockResolvedValue({
      paciente: { id: "pac-1", nombre: "Bruno", apellido: "Iglesias", dni: "30111222", telefono: "+549", createdAt: new Date().toISOString() },
    });
    const user = userEvent.setup();
    render(<AgregarPacienteButton />);

    await user.click(screen.getByRole("button", { name: "+ Agregar paciente" }));
    await user.type(screen.getByLabelText("Nombre"), "Bruno");
    await user.type(screen.getByLabelText("Apellido"), "Iglesias");
    await user.type(screen.getByLabelText("DNI"), "30111222");
    await user.type(screen.getByLabelText("Teléfono"), "+5493511234567");
    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(await screen.findByText("+ Agregar paciente")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
